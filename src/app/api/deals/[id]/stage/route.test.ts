import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: vi.fn(),
  engineSendTemplate: vi.fn(),
  engineSendText: vi.fn(),
  runAutomationsForTrigger: vi.fn(),
  resolveConversationByPhone: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn((err) =>
    Response.json({ error: err instanceof Error ? err.message : 'auth failed' }, { status: 403 })
  ),
}));

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

vi.mock('@/lib/automations/meta-send', () => ({
  engineSendTemplate: mocks.engineSendTemplate,
  engineSendText: mocks.engineSendText,
}));

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: mocks.runAutomationsForTrigger,
}));

vi.mock('@/lib/whatsapp/resolve-conversation', () => ({
  resolveConversationByPhone: mocks.resolveConversationByPhone,
}));

import { POST } from './route';

const authContext = {
  supabase: { name: 'scoped-client' },
  accountId: 'acc-123',
  userId: 'user-456',
  role: 'agent',
  account: { id: 'acc-123', name: 'Acme Corp' },
};

function createMockDb(dealData: any, stageData: any) {
  const historyInserts: any[] = [];

  const db: any = {
    _historyInserts: historyInserts,
    from: vi.fn((table: string) => {
      if (table === 'deals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: dealData,
                  error: dealData ? null : { message: 'not found' },
                }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...dealData, stage_id: stageData?.id },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'pipeline_stages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: stageData,
                  error: stageData ? null : { message: 'stage not found' },
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'cases') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { case_number: 'CAS-2026-9999' },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { full_name: 'Agent Smith' },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'conversations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'conv-777' },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'deal_stage_history') {
        return {
          insert: vi.fn(async (row: any) => {
            historyInserts.push(row);
            return { error: null };
          }),
        };
      }
      return {};
    }),
  };

  return db;
}

const params = { params: Promise.resolve({ id: 'deal-101' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(authContext);
  mocks.engineSendTemplate.mockResolvedValue({ whatsapp_message_id: 'wamid.HB123' });
  mocks.engineSendText.mockResolvedValue({ whatsapp_message_id: 'wamid.TEXT456' });
  mocks.runAutomationsForTrigger.mockResolvedValue(undefined);
});

describe('POST /api/deals/[id]/stage', () => {
  it('validates required new_stage_id', async () => {
    const req = new Request('http://localhost/api/deals/deal-101/stage', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('new_stage_id is required');
  });

  it('moves deal stage and dispatches automated WhatsApp template notification', async () => {
    const mockDeal = {
      id: 'deal-101',
      title: 'Global Talent Visa',
      value: 5000,
      currency: 'USD',
      stage_id: 'stage-1',
      pipeline_id: 'pipe-1',
      contact_id: 'contact-99',
      expected_close_date: '2026-10-01',
      contact: {
        id: 'contact-99',
        name: 'John Doe',
        phone: '+15551234567',
      },
    };

    const mockTargetStage = {
      id: 'stage-2',
      name: 'Visa Submitted',
      pipeline_id: 'pipe-1',
      whatsapp_notification: {
        enabled: true,
        mode: 'template',
        template_name: 'visa_milestone_update',
        template_language: 'en',
        template_params: ['{{contact.name}}', '{{deal.title}}', '{{stage.name}}'],
      },
    };

    const mockDb = createMockDb(mockDeal, mockTargetStage);
    mocks.supabaseAdmin.mockReturnValue(mockDb);

    const req = new Request('http://localhost/api/deals/deal-101/stage', {
      method: 'POST',
      body: JSON.stringify({ new_stage_id: 'stage-2' }),
    });

    const res = await POST(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.notification_sent).toBe(true);
    expect(json.whatsapp_message_id).toBe('wamid.HB123');

    // Check template send was called with properly interpolated variables
    expect(mocks.engineSendTemplate).toHaveBeenCalledWith({
      accountId: 'acc-123',
      userId: 'user-456',
      conversationId: 'conv-777',
      contactId: 'contact-99',
      templateName: 'visa_milestone_update',
      language: 'en',
      params: ['John Doe', 'Global Talent Visa', 'Visa Submitted'],
    });

    // Check audit history insert
    expect(mockDb._historyInserts).toHaveLength(1);
    expect(mockDb._historyInserts[0]).toMatchObject({
      account_id: 'acc-123',
      deal_id: 'deal-101',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-2',
      notification_sent: true,
      notification_template: 'visa_milestone_update',
      whatsapp_message_id: 'wamid.HB123',
    });

    // Check deal_stage_changed automation trigger dispatch
    expect(mocks.runAutomationsForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-123',
        triggerType: 'deal_stage_changed',
        contactId: 'contact-99',
        context: expect.objectContaining({
          vars: expect.objectContaining({
            deal_id: 'deal-101',
            deal_title: 'Global Talent Visa',
            stage_id: 'stage-2',
            stage_name: 'Visa Submitted',
            previous_stage_id: 'stage-1',
          }),
        }),
      })
    );
  });

  it('supports custom text notifications with dynamic placeholders', async () => {
    const mockDeal = {
      id: 'deal-101',
      title: 'Luxury Villa Offer',
      value: 1200000,
      currency: 'USD',
      stage_id: 'stage-1',
      pipeline_id: 'pipe-1',
      contact_id: 'contact-99',
      contact: {
        id: 'contact-99',
        name: 'Jane Smith',
        phone: '+15559876543',
      },
    };

    const mockTargetStage = {
      id: 'stage-2',
      name: 'Offer Accepted',
      pipeline_id: 'pipe-1',
      whatsapp_notification: {
        enabled: true,
        mode: 'custom_text',
        custom_text: 'Hi {{contact.name}}, your deal "{{deal.title}}" moved to {{stage.name}} by {{user.name}}! Case: {{case.case_number}}',
      },
    };

    const mockDb = createMockDb(mockDeal, mockTargetStage);
    mocks.supabaseAdmin.mockReturnValue(mockDb);

    const req = new Request('http://localhost/api/deals/deal-101/stage', {
      method: 'POST',
      body: JSON.stringify({ new_stage_id: 'stage-2' }),
    });

    const res = await POST(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.notification_sent).toBe(true);
    expect(mocks.engineSendText).toHaveBeenCalledWith({
      accountId: 'acc-123',
      userId: 'user-456',
      conversationId: 'conv-777',
      contactId: 'contact-99',
      text: 'Hi Jane Smith, your deal "Luxury Villa Offer" moved to Offer Accepted by Agent Smith! Case: CAS-2026-9999',
    });
  });
});
