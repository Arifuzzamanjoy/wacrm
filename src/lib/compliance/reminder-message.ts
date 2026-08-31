// ============================================================
// Expiry reminder copy.
//
// Split out of `expiry-engine.ts` so the client can share it: that
// module imports the service-role Supabase client and can never be
// pulled into a component. The compliance page pre-fills its "send
// reminder" box with the same text the scheduled scan would send, and
// keeping two copies of the wording in sync by hand is how they drift.
// ============================================================

/** Fallbacks for a contact row with no name on it. */
export const DEFAULT_CONTACT_NAME = "Valued Client";

/**
 * Render the reminder body.
 *
 * With a `template`, the placeholders below are substituted (both the
 * positional `{{1}}`-style Meta uses and readable aliases). Without
 * one, a plain default is produced.
 */
export function formatExpiryReminderMessage(
  template: string | null | undefined,
  contactName: string,
  docTitle: string,
  expiryDate: string,
  daysRemaining: number
): string {
  const safeName = contactName || DEFAULT_CONTACT_NAME;
  const remainingStr = daysRemaining <= 0 ? '0' : String(daysRemaining);

  if (template && template.trim()) {
    return template
      .replace(/\{\{1\}\}|\{\{name\}\}|\{\{contact\.name\}\}/gi, safeName)
      .replace(/\{\{2\}\}|\{\{document\}\}|\{\{title\}\}|\{\{document\.title\}\}/gi, docTitle)
      .replace(/\{\{3\}\}|\{\{expiry_date\}\}|\{\{date\}\}/gi, expiryDate)
      .replace(/\{\{4\}\}|\{\{days\}\}|\{\{days_remaining\}\}/gi, remainingStr);
  }

  if (daysRemaining <= 0) {
    return `⚠️ Expiry Alert: Hello ${safeName}, your ${docTitle} expired on ${expiryDate}. Please renew and upload your updated document as soon as possible to keep your file active.`;
  }

  return `⚠️ Expiry Reminder: Hello ${safeName}, your ${docTitle} expires on ${expiryDate} (in ${daysRemaining} days). Please renew and upload your updated document to keep your file active.`;
}
