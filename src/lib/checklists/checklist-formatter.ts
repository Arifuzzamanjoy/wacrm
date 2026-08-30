import type { ContactDocument } from "@/types";
import { getIndustryMeta } from "./industries";

export interface GenerateChaserOptions {
  contactName?: string;
  /**
   * The checklist this update covers — "Canada Study Permit",
   * "Client Onboarding", "Seller Verification". Shown in bold to the
   * recipient.
   */
  category: string;
  /**
   * Vertical the account operates in. Only affects the noun used for
   * the thing being chased ("application" / "onboarding" / "policy").
   * Defaults to the vertical-neutral "request".
   */
  industry?: string | null;
  documents: ContactDocument[];
}

/**
 * Formats a clean, professional, emoji-structured WhatsApp message
 * breaking a checklist down into Verified, Under Review, Needs
 * Re-upload and Still Missing.
 *
 * Vertical-neutral by design: the only industry-dependent word is the
 * noun for the engagement, which comes from the industry taxonomy.
 * `waived` items are intentionally omitted — they no longer apply to
 * this client, so listing them would just add noise.
 */
export function generateWhatsAppDocumentChaser({
  contactName,
  category,
  industry,
  documents,
}: GenerateChaserOptions): string {
  const verified = documents.filter((d) => d.status === "verified");
  const rejected = documents.filter((d) => d.status === "rejected");
  const missing = documents.filter((d) => d.status === "missing");
  const submitted = documents.filter((d) => d.status === "submitted");

  const caseNoun = industry ? getIndustryMeta(industry).caseNoun : "request";

  const nameGreeting =
    contactName && contactName.trim()
      ? `Hello ${contactName.trim()},`
      : `Hello,`;
  const lines: string[] = [
    nameGreeting,
    "",
    `Here is your document checklist update for your *${category}* ${caseNoun}:`,
    "",
  ];

  if (verified.length > 0) {
    lines.push(`✅ *Verified (${verified.length}):*`);
    for (const doc of verified) {
      const expiryNote = doc.expiry_date
        ? ` (Valid until: ${doc.expiry_date})`
        : "";
      lines.push(`• ${doc.title}${expiryNote}`);
    }
    lines.push("");
  }

  if (submitted.length > 0) {
    lines.push(`⏳ *Under Review (${submitted.length}):*`);
    for (const doc of submitted) {
      lines.push(`• ${doc.title}`);
    }
    lines.push("");
  }

  if (rejected.length > 0) {
    lines.push(`⚠️ *Needs Re-upload / Action Required (${rejected.length}):*`);
    for (const doc of rejected) {
      const reason = doc.rejection_reason
        ? `\n   ↳ _Note: ${doc.rejection_reason}_`
        : "";
      lines.push(`• ${doc.title}${reason}`);
    }
    lines.push("");
  }

  if (missing.length > 0) {
    lines.push(`❌ *Still Missing (${missing.length}):*`);
    for (const doc of missing) {
      const mandatoryNote = doc.is_mandatory ? "" : " _(Optional)_";
      const desc = doc.description ? ` - ${doc.description}` : "";
      lines.push(`• ${doc.title}${mandatoryNote}${desc}`);
    }
    lines.push("");
  }

  lines.push(
    "Please send the missing or corrected documents directly here on WhatsApp as PDF or clear photos."
  );

  return lines.join("\n");
}
