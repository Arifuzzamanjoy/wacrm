import type { ContactDocument } from "@/types";

export interface GenerateChaserOptions {
  contactName?: string;
  visaCategory: string;
  documents: ContactDocument[];
}

/**
 * Formats a clean, professional, and emoji-structured WhatsApp message
 * breaking down documents into Verified, Needs Re-upload, and Still Missing.
 */
export function generateWhatsAppDocumentChaser({
  contactName,
  visaCategory,
  documents,
}: GenerateChaserOptions): string {
  const verified = documents.filter((d) => d.status === "verified");
  const rejected = documents.filter((d) => d.status === "rejected");
  const missing = documents.filter((d) => d.status === "missing");
  const submitted = documents.filter((d) => d.status === "submitted");

  const nameGreeting = contactName && contactName.trim() ? `Hello ${contactName.trim()},` : `Hello,`;
  const lines: string[] = [
    nameGreeting,
    "",
    `Here is your document checklist update for your *${visaCategory}* application:`,
    "",
  ];

  if (verified.length > 0) {
    lines.push(`✅ *Verified (${verified.length}):*`);
    for (const doc of verified) {
      const expiryNote = doc.expiry_date ? ` (Valid until: ${doc.expiry_date})` : "";
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
      const reason = doc.rejection_reason ? `\n   ↳ _Note: ${doc.rejection_reason}_` : "";
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

  lines.push("Please send the missing or corrected documents directly here on WhatsApp as PDF or clear photos.");

  return lines.join("\n");
}
