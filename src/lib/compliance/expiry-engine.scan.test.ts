import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  engineSendText: vi.fn(),
  engineSendTemplate: vi.fn(),
  resolveConversationByPhone: vi.fn(),
  resolveAuditUserId: vi.fn(),
}));

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));
vi.mock('@/lib/automations/meta-send', () => ({
  engineSendText: mocks.engineSendText,
  engineSendTemplate: mocks.engineSendTemplate,
}));
vi.mock('@/lib/whatsapp/resolve-conversation', () => ({
  resolveConversationByPhone: mocks.resolveConversationByPhone,
}));
vi.mock('@/lib/api/v1/contacts', () => ({
  resolveAuditUserId: mocks.resolveAuditUserId,
}));

import { runComplianceScanForAccount } from './expiry-engine';

/** A day far enough out to land in the 30-day tier but not the 7-day one. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

interface Recorded {
  table: string;
  filters: Record<string, unknown>;
}

/**
 * Chainable PostgREST-shaped stub. It records the `.eq()` filters each
 * query applies so a test can assert on them, and awaits to whatever
 * `rows(table)` hands back.
 */
function createDb(rows: (table: string) => unknown[]) {
  const recorded: Recorded[] = [];
  const inserts: Record<string, Record<string, unknown>[]> = {};

  const from = (table: string) => {
    const entry: Recorded = { table, filters: {} };
    const result = { data: rows(table), error: null };

    const builder: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      insert: (row: Record<string, unknown>) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
    for (const method of ['select', 'in', 'not', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    builder.eq = (col: string, val: unknown) => {
      entry.filters[col] = val;
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve({ data: rows(table)[0] ?? null, error: null });
    builder.single = () => Promise.resolve({ data: rows(table)[0] ?? null, error: null });

    recorded.push(entry);
    return builder;
  };

  return { db: { from: vi.fn(from) }, recorded, inserts };
}

const DOC = {
  id: 'doc-1',
  account_id: 'acc-1',
  contact_id: 'contact-1',
  title: 'Passport',
  category: 'identity',
  status: 'submitted',
  expiry_date: inDays(20),
  contacts: { id: 'contact-1', name: 'Ana Silva', phone: '+15551110000' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAuditUserId.mockResolvedValue('user-1');
  mocks.resolveConversationByPhone.mockResolvedValue({ conversationId: 'conv-1' });
  mocks.engineSendText.mockResolvedValue({ whatsapp_message_id: 'wamid.OK' });
});

describe('runComplianceScanForAccount', () => {
  it('does not treat a previously failed alert as already sent', async () => {
    // The engine logs failed attempts to document_expiry_alerts too.
    // Before the fix it read that table back unfiltered, so one
    // transient Meta error retired that threshold permanently and the
    // client never heard about the expiring document again.
    const { db, recorded } = createDb((table) => {
      if (table === 'account_compliance_settings') return [];
      if (table === 'contact_documents') return [DOC];
      if (table === 'document_expiry_alerts') return []; // status='sent' matches nothing
      return [];
    });
    mocks.supabaseAdmin.mockReturnValue(db);

    const res = await runComplianceScanForAccount('acc-1', { sendWhatsApp: true });

    expect(res.alerts_sent).toBe(1);
    expect(mocks.engineSendText).toHaveBeenCalledTimes(1);

    const dedupeQuery = recorded.filter(
      (r) => r.table === 'document_expiry_alerts' && 'status' in r.filters
    );
    expect(dedupeQuery).toHaveLength(1);
    expect(dedupeQuery[0].filters.status).toBe('sent');
    expect(dedupeQuery[0].filters.account_id).toBe('acc-1');
  });

  it('scopes the alert history lookup to the account', async () => {
    // This path runs on the service-role client, which bypasses RLS,
    // so the tenant boundary has to be in the query itself.
    const { db, recorded } = createDb((table) => {
      if (table === 'contact_documents') return [DOC];
      return [];
    });
    mocks.supabaseAdmin.mockReturnValue(db);

    await runComplianceScanForAccount('acc-1', { sendWhatsApp: false });

    const alertQueries = recorded.filter((r) => r.table === 'document_expiry_alerts');
    expect(alertQueries.length).toBeGreaterThan(0);
    for (const q of alertQueries) {
      expect(q.filters.account_id).toBe('acc-1');
    }
  });
});
