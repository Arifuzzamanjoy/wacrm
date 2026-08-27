import { describe, expect, it } from "vitest";
import { generateWhatsAppDocumentChaser } from "./checklist-formatter";
import type { ContactDocument } from "@/types";

describe("generateWhatsAppDocumentChaser", () => {
  const baseDoc: Omit<ContactDocument, "id" | "title" | "status"> = {
    account_id: "acc-1",
    contact_id: "contact-1",
    visa_category: "Canada Study Permit",
    is_mandatory: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("formats a mixed checklist update correctly with contact name", () => {
    const docs: ContactDocument[] = [
      {
        ...baseDoc,
        id: "doc-1",
        title: "Passport Bio-Page",
        status: "verified",
        expiry_date: "2028-10-15",
      },
      {
        ...baseDoc,
        id: "doc-2",
        title: "Letter of Acceptance",
        status: "submitted",
      },
      {
        ...baseDoc,
        id: "doc-3",
        title: "Bank Statement",
        status: "rejected",
        rejection_reason: "Bank stamp missing on pages 3 and 4",
      },
      {
        ...baseDoc,
        id: "doc-4",
        title: "IELTS Score Sheet",
        status: "missing",
        description: "Minimum overall band 6.5",
      },
      {
        ...baseDoc,
        id: "doc-5",
        title: "eMedical",
        status: "missing",
        is_mandatory: false,
        description: "Upfront medical exam sheet",
      },
    ];

    const result = generateWhatsAppDocumentChaser({
      contactName: "John Doe",
      visaCategory: "Canada Study Permit",
      documents: docs,
    });

    expect(result).toContain("Hello John Doe,");
    expect(result).toContain("Here is your document checklist update for your *Canada Study Permit* application:");
    expect(result).toContain("✅ *Verified (1):*");
    expect(result).toContain("• Passport Bio-Page (Valid until: 2028-10-15)");
    expect(result).toContain("⏳ *Under Review (1):*");
    expect(result).toContain("• Letter of Acceptance");
    expect(result).toContain("⚠️ *Needs Re-upload / Action Required (1):*");
    expect(result).toContain("• Bank Statement\n   ↳ _Note: Bank stamp missing on pages 3 and 4_");
    expect(result).toContain("❌ *Still Missing (2):*");
    expect(result).toContain("• IELTS Score Sheet - Minimum overall band 6.5");
    expect(result).toContain("• eMedical _(Optional)_ - Upfront medical exam sheet");
    expect(result).toContain("Please send the missing or corrected documents directly here on WhatsApp as PDF or clear photos.");
  });

  it("handles missing contact name with generic greeting", () => {
    const docs: ContactDocument[] = [
      {
        ...baseDoc,
        id: "doc-1",
        title: "Passport",
        status: "missing",
      },
    ];

    const result = generateWhatsAppDocumentChaser({
      visaCategory: "UK Student Visa",
      documents: docs,
    });

    expect(
      result.startsWith(
        "Hello,\n\nHere is your document checklist update for your *UK Student Visa* application:"
      )
    ).toBe(true);
    expect(result).toContain("❌ *Still Missing (1):*");
    expect(result).toContain("• Passport");
  });

  it("formats correctly when all documents are verified", () => {
    const docs: ContactDocument[] = [
      {
        ...baseDoc,
        id: "doc-1",
        title: "Passport",
        status: "verified",
        expiry_date: "2029-01-01",
      },
      {
        ...baseDoc,
        id: "doc-2",
        title: "I-20",
        status: "verified",
      },
    ];

    const result = generateWhatsAppDocumentChaser({
      contactName: "Sarah",
      visaCategory: "USA F-1 Visa",
      documents: docs,
    });

    expect(result).toContain("✅ *Verified (2):*");
    expect(result).toContain("• Passport (Valid until: 2029-01-01)");
    expect(result).toContain("• I-20");
    expect(result).not.toContain("Under Review");
    expect(result).not.toContain("Needs Re-upload");
    expect(result).not.toContain("Still Missing");
  });
});
