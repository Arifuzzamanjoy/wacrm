import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText, engineSendTemplate } from '@/lib/automations/meta-send';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { formatExpiryReminderMessage } from './reminder-message';
import type {
  AccountComplianceSettings,
  ComplianceOverviewStats,
  DocumentExpiryAlert,
  ExpiryAlertTier,
  ExpiryUrgencyStatus,
  MonitoredDocumentItem,
  Contact,
} from '@/types';

export const DEFAULT_ALERT_THRESHOLDS = [90, 60, 30, 7];

// Re-exported so existing importers (and the tests) keep working.
export { formatExpiryReminderMessage };

/**
 * Calculates days remaining until expiration relative to midnight today.
 */
export function calculateDaysRemaining(expiryDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiryDateStr + 'T00:00:00');
  const diffMs = expDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Maps days remaining to urgency tier.
 */
export function calculateUrgency(daysRemaining: number): ExpiryUrgencyStatus {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 30) return 'critical';
  if (daysRemaining <= 90) return 'warning';
  return 'compliant';
}

/**
 * Fetch account compliance settings or return sensible defaults.
 */
export async function getAccountComplianceSettings(
  accountId: string
): Promise<AccountComplianceSettings> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('account_compliance_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[getAccountComplianceSettings] error:', error);
  }

  if (data) {
    return data as AccountComplianceSettings;
  }

  return {
    id: '',
    account_id: accountId,
    auto_whatsapp_enabled: true,
    alert_thresholds: DEFAULT_ALERT_THRESHOLDS,
    whatsapp_template_name: null,
    whatsapp_template_language: 'en_US',
    custom_message_template: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Update or upsert account compliance settings.
 */
export async function updateAccountComplianceSettings(
  accountId: string,
  settings: Partial<AccountComplianceSettings>
): Promise<AccountComplianceSettings> {
  const db = supabaseAdmin();

  const payload: Record<string, unknown> = {
    account_id: accountId,
    updated_at: new Date().toISOString(),
  };

  if (typeof settings.auto_whatsapp_enabled === 'boolean') {
    payload.auto_whatsapp_enabled = settings.auto_whatsapp_enabled;
  }
  if (Array.isArray(settings.alert_thresholds)) {
    payload.alert_thresholds = settings.alert_thresholds;
  }
  if ('whatsapp_template_name' in settings) {
    payload.whatsapp_template_name = settings.whatsapp_template_name || null;
  }
  if ('whatsapp_template_language' in settings) {
    payload.whatsapp_template_language = settings.whatsapp_template_language || 'en_US';
  }
  if ('custom_message_template' in settings) {
    payload.custom_message_template = settings.custom_message_template || null;
  }

  const { data, error } = await db
    .from('account_compliance_settings')
    .upsert(payload, { onConflict: 'account_id' })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[updateAccountComplianceSettings] error:', error);
    throw new Error(error?.message || 'Failed to update compliance settings');
  }

  return data as AccountComplianceSettings;
}

/**
 * Fetch all monitored documents with an expiry_date for an account,
 * hydrated with contact info, days remaining, urgency status, and last alert log.
 */
export async function fetchMonitoredDocuments(accountId: string): Promise<{
  documents: MonitoredDocumentItem[];
  stats: ComplianceOverviewStats;
}> {
  const db = supabaseAdmin();

  // 1. Fetch contact_documents with expiry_date NOT NULL
  const { data: docs, error: docsErr } = await db
    .from('contact_documents')
    .select('*, contacts(*)')
    .eq('account_id', accountId)
    .not('expiry_date', 'is', null)
    .order('expiry_date', { ascending: true });

  if (docsErr) {
    console.error('[fetchMonitoredDocuments] docs error:', docsErr);
    throw new Error('Failed to fetch monitored documents');
  }

  if (!docs || docs.length === 0) {
    return {
      documents: [],
      stats: {
        expired_count: 0,
        critical_count: 0,
        warning_count: 0,
        compliant_count: 0,
        total_monitored: 0,
      },
    };
  }

  const docIds = docs.map((d) => d.id as string);

  // 2. Fetch latest alerts for these documents
  // account_id is pinned alongside document_id: this runs on the
  // service-role client, which bypasses RLS, so the tenant boundary has
  // to be stated in the query rather than assumed from the id space.
  const { data: alerts, error: alertsErr } = await db
    .from('document_expiry_alerts')
    .select('*')
    .eq('account_id', accountId)
    .in('document_id', docIds)
    .order('sent_at', { ascending: false });

  if (alertsErr) {
    console.error('[fetchMonitoredDocuments] alerts error:', alertsErr);
  }

  const alertsByDocId = new Map<string, DocumentExpiryAlert>();
  if (alerts) {
    for (const alert of alerts as DocumentExpiryAlert[]) {
      if (!alertsByDocId.has(alert.document_id)) {
        alertsByDocId.set(alert.document_id, alert);
      }
    }
  }

  let expired_count = 0;
  let critical_count = 0;
  let warning_count = 0;
  let compliant_count = 0;

  const items: MonitoredDocumentItem[] = docs.map((d) => {
    const days = calculateDaysRemaining(d.expiry_date as string);
    const urgency = calculateUrgency(days);

    if (urgency === 'expired') expired_count++;
    else if (urgency === 'critical') critical_count++;
    else if (urgency === 'warning') warning_count++;
    else compliant_count++;

    return {
      id: d.id as string,
      account_id: d.account_id as string,
      contact_id: d.contact_id as string,
      title: d.title as string,
      category: d.category as string,
      expiry_date: d.expiry_date as string,
      status: d.status,
      days_remaining: days,
      urgency,
      contact: (d.contacts as Contact) ?? undefined,
      last_alert: alertsByDocId.get(d.id as string) ?? null,
    };
  });

  return {
    documents: items,
    stats: {
      expired_count,
      critical_count,
      warning_count,
      compliant_count,
      total_monitored: items.length,
    },
  };
}

/**
 * Determine the highest urgency tier threshold that applies to days remaining.
 */
export function matchApplicableAlertTier(
  daysRemaining: number,
  enabledThresholds: number[]
): ExpiryAlertTier | null {
  if (daysRemaining <= 0) {
    return 'expired';
  }
  if (daysRemaining <= 7 && enabledThresholds.includes(7)) {
    return '7_days';
  }
  if (daysRemaining <= 30 && enabledThresholds.includes(30)) {
    return '30_days';
  }
  if (daysRemaining <= 60 && enabledThresholds.includes(60)) {
    return '60_days';
  }
  if (daysRemaining <= 90 && enabledThresholds.includes(90)) {
    return '90_days';
  }
  return null;
}

/**
 * Runs a compliance scan for an account:
 * - Scans all documents with expiry_date.
 * - For thresholds that have been breached, checks if an alert for that tier was already sent.
 * - If not sent and WhatsApp alerts enabled, resolves conversation, sends WhatsApp message,
 *   inserts audit record into `document_expiry_alerts`, and creates in-app notification.
 */
export async function runComplianceScanForAccount(
  accountId: string,
  options?: { sendWhatsApp?: boolean }
): Promise<{ scanned: number; alerts_sent: number }> {
  const db = supabaseAdmin();
  const settings = await getAccountComplianceSettings(accountId);
  const shouldSendWhatsApp = options?.sendWhatsApp ?? settings.auto_whatsapp_enabled;

  const { documents } = await fetchMonitoredDocuments(accountId);
  let alertsSent = 0;

  if (documents.length === 0) {
    return { scanned: 0, alerts_sent: 0 };
  }

  // Audit user for notifications & conversation resolution
  let auditUserId: string;
  try {
    auditUserId = await resolveAuditUserId(db, accountId);
  } catch (err) {
    console.error('[runComplianceScanForAccount] resolveAuditUserId error:', err);
    return { scanned: documents.length, alerts_sent: 0 };
  }

  // Fetch all existing alerts for these documents in batch
  const docIds = documents.map((d) => d.id);
  // Only successfully *sent* alerts suppress a re-send. Failed attempts
  // are logged to the same table, and counting them as "already sent"
  // meant one transient Meta API error silently retired that threshold
  // for the document forever — the client never heard from us again.
  const { data: existingAlerts } = await db
    .from('document_expiry_alerts')
    .select('document_id, alert_tier')
    .eq('account_id', accountId)
    .eq('status', 'sent')
    .in('document_id', docIds);

  const sentSet = new Set<string>();
  if (existingAlerts) {
    for (const a of existingAlerts) {
      sentSet.add(`${a.document_id}:${a.alert_tier}`);
    }
  }

  for (const doc of documents) {
    const tier = matchApplicableAlertTier(
      doc.days_remaining,
      settings.alert_thresholds || DEFAULT_ALERT_THRESHOLDS
    );

    if (!tier) continue;

    const alertKey = `${doc.id}:${tier}`;
    if (sentSet.has(alertKey)) {
      // Idempotency: alert already sent for this threshold window
      continue;
    }

    if (!shouldSendWhatsApp || !doc.contact?.phone) {
      continue;
    }

    const contactName = doc.contact.name || 'Client';
    const messageText = formatExpiryReminderMessage(
      settings.custom_message_template,
      contactName,
      doc.title,
      doc.expiry_date,
      doc.days_remaining
    );

    let waMessageId: string | null = null;
    let errorMessage: string | null = null;
    let convId: string | null = null;

    try {
      // 1. Resolve or find conversation
      const res = await resolveConversationByPhone(
        db,
        accountId,
        doc.contact.phone,
        contactName
      );
      convId = res.conversationId;

      // 2. Dispatch WhatsApp message
      if (settings.whatsapp_template_name) {
        try {
          const sent = await engineSendTemplate({
            accountId,
            userId: auditUserId,
            conversationId: convId,
            contactId: doc.contact_id,
            templateName: settings.whatsapp_template_name,
            language: settings.whatsapp_template_language || 'en_US',
            params: [
              contactName,
              doc.title,
              doc.expiry_date,
              String(Math.max(0, doc.days_remaining)),
            ],
          });
          waMessageId = sent.whatsapp_message_id;
        } catch (tmplErr) {
          console.warn(
            '[runComplianceScanForAccount] template send failed, falling back to text:',
            tmplErr
          );
          const sent = await engineSendText({
            accountId,
            userId: auditUserId,
            conversationId: convId,
            contactId: doc.contact_id,
            text: messageText,
          });
          waMessageId = sent.whatsapp_message_id;
        }
      } else {
        const sent = await engineSendText({
          accountId,
          userId: auditUserId,
          conversationId: convId,
          contactId: doc.contact_id,
          text: messageText,
        });
        waMessageId = sent.whatsapp_message_id;
      }

      // 3. Record alert audit
      await db.from('document_expiry_alerts').insert({
        account_id: accountId,
        document_id: doc.id,
        contact_id: doc.contact_id,
        alert_tier: tier,
        channel: 'whatsapp',
        status: 'sent',
        whatsapp_message_id: waMessageId,
        sent_at: new Date().toISOString(),
      });

      sentSet.add(alertKey);
      alertsSent++;

      // 4. Create in-app notification for agents
      const notifType = doc.days_remaining <= 0 ? 'document_expired' : 'document_expiring';
      const notifTitle = `Document Expiry Alert: ${doc.title}`;
      const notifBody = `${contactName}'s ${doc.title} ${
        doc.days_remaining <= 0
          ? `expired on ${doc.expiry_date}`
          : `expires in ${doc.days_remaining} days (${doc.expiry_date})`
      }`;

      // Notify account owner / agents
      await db.from('notifications').insert({
        account_id: accountId,
        user_id: auditUserId,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        contact_id: doc.contact_id,
        conversation_id: convId,
      });
    } catch (sendErr) {
      errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(`[runComplianceScanForAccount] error sending alert for doc ${doc.id}:`, errorMessage);

      // Record failed alert attempt
      await db.from('document_expiry_alerts').insert({
        account_id: accountId,
        document_id: doc.id,
        contact_id: doc.contact_id,
        alert_tier: tier,
        channel: 'whatsapp',
        status: 'failed',
        error_message: errorMessage,
        sent_at: new Date().toISOString(),
      });
    }
  }

  return { scanned: documents.length, alerts_sent: alertsSent };
}

/**
 * Send a 1-click manual WhatsApp reminder for a specific document.
 */
export async function sendManualDocumentExpiryReminder(
  accountId: string,
  documentId: string,
  customMessage?: string
): Promise<{ ok: boolean; whatsapp_message_id?: string }> {
  const db = supabaseAdmin();

  // 1. Fetch document and contact
  const { data: doc, error: docErr } = await db
    .from('contact_documents')
    .select('*, contacts(*)')
    .eq('id', documentId)
    .eq('account_id', accountId)
    .single();

  if (docErr || !doc) {
    throw new Error('Document not found');
  }

  const contact = (doc.contacts as Contact) ?? null;
  if (!contact?.phone) {
    throw new Error('Contact does not have a phone number');
  }

  const auditUserId = await resolveAuditUserId(db, accountId);
  const contactName = contact.name || 'Client';
  const daysRemaining = doc.expiry_date ? calculateDaysRemaining(doc.expiry_date) : 0;

  const messageText =
    customMessage && customMessage.trim()
      ? customMessage.trim()
      : formatExpiryReminderMessage(
          null,
          contactName,
          doc.title,
          doc.expiry_date || 'N/A',
          daysRemaining
        );

  // 2. Resolve conversation
  const { conversationId } = await resolveConversationByPhone(
    db,
    accountId,
    contact.phone,
    contactName
  );

  // 3. Send text message
  const { whatsapp_message_id } = await engineSendText({
    accountId,
    userId: auditUserId,
    conversationId,
    contactId: doc.contact_id,
    text: messageText,
  });

  // 4. Log alert audit with tier 'manual'
  await db.from('document_expiry_alerts').insert({
    account_id: accountId,
    document_id: doc.id,
    contact_id: doc.contact_id,
    alert_tier: 'manual',
    channel: 'whatsapp',
    status: 'sent',
    whatsapp_message_id,
    sent_at: new Date().toISOString(),
  });

  return { ok: true, whatsapp_message_id };
}
