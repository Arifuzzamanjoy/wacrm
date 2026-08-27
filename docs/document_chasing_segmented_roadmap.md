# Document Chasing Solution: Segmented Implementation Roadmap
**Dynamic Visa Document Checklist & Verification Hub for WACRM**

---

## 1. Executive Summary & Problem Statement

In immigration agencies and visa consultancies:
- **High-Volume Unstructured Submissions**: Clients send 15–30 documents over WhatsApp as loose screenshots, partial PDFs, rotated phone camera photos, or expired certificates.
- **Counselor Cognitive Load**: Counselors manually track what has been submitted, verified, rejected, or missing across multiple spreadsheets or mental notes.
- **Excessive Time Wastage**: Over **2 hours per client** is wasted typing repetitive manual WhatsApp follow-ups asking for missing or corrected documents.
- **Critical Business Risk**: Submitting applications with blurry, partial, or expired documents leads to immediate visa refusals or severe delays.

### The Objective
Build a native, zero-friction **Document Chasing & Verification Hub** embedded inside the WACRM inbox that allows:
1. One-click assignment of standard visa document templates (Canada, UK, USA, Australia, Schengen, etc.).
2. Direct linking of inbound WhatsApp media (PDFs / Photos) to specific checklist requirements.
3. Rapid counselor review (Verify with expiry date, or Reject with reasons).
4. One-click generation and dispatch of beautifully formatted WhatsApp checklist updates.

---

## 2. Solution Architecture & User Journey

```mermaid
flowchart TD
    subgraph Client Journey (WhatsApp)
        A[Client sends PDF/Photo in WhatsApp] --> B[Message arrives in WACRM Thread]
        K[Client receives formatted WhatsApp Chaser] --> L[Client sends remaining missing files]
    end

    subgraph Counselor Journey (WACRM Inbox)
        B --> C{Counselor action on bubble}
        C -->|Click 'Attach to Checklist'| D[Select checklist requirement e.g. 'Bank Statement']
        D --> E[Status transitions to 'Submitted']
        
        F[Open Contact Sidebar: 'Visa Documents' Tab] --> G[View Document List & Progress Bar]
        G --> H{Counselor Review}
        H -->|Valid| I[Click 'Verify' + Set Expiry Date]
        H -->|Invalid / Blurry| J[Click 'Reject' + Select/Type Reason]
        
        G --> M[Click '📲 Send Missing Items Reminder']
        M --> N[MessageComposer pre-filled with structured checklist text]
        N -->|Send| K
    end
```

---

## 3. Segmented Implementation Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STEP-BY-STEP IMPLEMENTATION SEGMENTS                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 1: Database Foundation & Schema Migration                                      │
│ • Migration `039_visa_document_checklists.sql` with multi-tenant RLS policies.         │
│ • Starter templates seeding (Canada, UK, Australia, USA, Schengen).                   │
│ • TypeScript data contracts & type exports in `src/types/index.ts`.                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 2: Backend Business Logic & REST API Endpoints                                 │
│ • WhatsApp Chaser text formatter utility with unit tests.                              │
│ • GET/POST `/api/visa-templates` endpoint.                                             │
│ • GET/POST/PATCH/DELETE `/api/contacts/[id]/documents` endpoints.                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 3: Document Hub Component in Inbox Sidebar                                     │
│ • Build `document-checklist-sidebar.tsx` with stream picker, progress & items.         │
│ • Integrate tabbed switcher (`Overview` / `Visa Docs`) into `contact-sidebar.tsx`.     │
│ • Add custom document creation dialog.                                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 4: Document Verification & Lightbox Preview Dialog                             │
│ • Build `document-verification-dialog.tsx` for fast photo/PDF inspection.             │
│ • Implement 1-click Approve with Expiry Date tracking (passports, IELTS, PCC).        │
│ • Implement 1-click Reject with preset reason chips + custom note.                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 5: In-Chat Media Integration & Quick Attach                                    │
│ • Build `attach-to-checklist-modal.tsx`.                                               │
│ • Add "Attach to Checklist" action to `message-actions.tsx` & inbound media bubbles.   │
│ • Update message linking and move item status to `submitted`.                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 6: 1-Click WhatsApp Chaser Pre-fill & Dispatch                                 │
│ • Connect sidebar reminder button to `MessageComposer` state.                          │
│ • Provide instant composer populate + focus for agent review.                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Segment 7: Internationalization (i18n), Testing & Verification                          │
│ • Add translations in `messages/en.json` and `messages/ko.json`.                       │
│ • Vitest automated unit tests and full TypeScript typecheck.                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Segment 1: Database Foundation & Schema Migration

### 1.1 Database Migration File: `supabase/migrations/039_visa_document_checklists.sql`

```sql
-- ============================================================
-- 039_visa_document_checklists.sql
-- Visa Document Checklist & Verification Hub
-- ============================================================

-- Table 1: Visa Checklist Templates (Presets per country & visa stream)
CREATE TABLE IF NOT EXISTS visa_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE, -- NULL for global system templates
  country_code TEXT NOT NULL, -- e.g. 'CA', 'UK', 'AU', 'US', 'EU'
  visa_category TEXT NOT NULL, -- e.g. 'Study Permit', 'Skilled Worker', 'Visitor'
  name TEXT NOT NULL,
  default_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visa_checklist_templates_account ON visa_checklist_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_visa_checklist_templates_country ON visa_checklist_templates(country_code);

ALTER TABLE visa_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visa_checklist_templates_select ON visa_checklist_templates;
CREATE POLICY visa_checklist_templates_select ON visa_checklist_templates FOR SELECT
  USING (account_id IS NULL OR is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS visa_checklist_templates_modify ON visa_checklist_templates;
CREATE POLICY visa_checklist_templates_modify ON visa_checklist_templates FOR ALL
  USING (account_id IS NOT NULL AND is_account_member(account_id, 'admin'));

-- Table 2: Contact Documents (Live checklist for each client contact)
CREATE TABLE IF NOT EXISTS contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  visa_category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'missing' 
    CHECK (status IN ('missing', 'submitted', 'verified', 'rejected')),
  rejection_reason TEXT,
  file_url TEXT,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  expiry_date DATE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_documents_contact ON contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_documents_status ON contact_documents(status);
CREATE INDEX IF NOT EXISTS idx_contact_documents_account ON contact_documents(account_id);

ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_documents_select ON contact_documents;
CREATE POLICY contact_documents_select ON contact_documents FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS contact_documents_insert ON contact_documents;
CREATE POLICY contact_documents_insert ON contact_documents FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS contact_documents_update ON contact_documents;
CREATE POLICY contact_documents_update ON contact_documents FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS contact_documents_delete ON contact_documents;
CREATE POLICY contact_documents_delete ON contact_documents FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Seed Standard Global Visa Checklist Templates
INSERT INTO visa_checklist_templates (account_id, country_code, visa_category, name, default_items)
VALUES 
(
  NULL,
  'CA',
  'Study Permit',
  'Canada Study Permit (SDS / Non-SDS)',
  '[
    {"title": "Passport Bio-Page", "description": "Clear scan of passport photo page, minimum 6 months validity", "is_mandatory": true, "expiry_required": true},
    {"title": "Letter of Acceptance (LOA)", "description": "Official acceptance letter from DLI institution with DLI number", "is_mandatory": true},
    {"title": "Proof of Financial Support (GIC & Bank)", "description": "CAD 20,635+ GIC certificate and/or 4-6 months bank statement", "is_mandatory": true},
    {"title": "Academic Transcripts & Certificates", "description": "All post-secondary and high school transcripts with certificates", "is_mandatory": true},
    {"title": "Language Proficiency Test (IELTS / PTE / TOEFL)", "description": "IELTS Academic/PTE score sheet, minimum 6.0 in each band", "is_mandatory": true, "expiry_required": true},
    {"title": "Statement of Purpose (SOP)", "description": "Explanation of study plan, ties to home country and financial justification", "is_mandatory": true},
    {"title": "Upfront Medical Examination (eMedical)", "description": "Information sheet provided by panel physician", "is_mandatory": false, "expiry_required": true},
    {"title": "Police Clearance Certificate (PCC)", "description": "National police certificate issued within the last 6 months", "is_mandatory": false, "expiry_required": true}
  ]'::jsonb
),
(
  NULL,
  'UK',
  'Student Visa',
  'UK Student Visa (Subclass 4)',
  '[
    {"title": "Current Valid Passport", "description": "Passport with at least 1 blank page for visa stamp", "is_mandatory": true, "expiry_required": true},
    {"title": "CAS Statement (Confirmation of Acceptance)", "description": "14-digit CAS number provided by licensed UK sponsor", "is_mandatory": true},
    {"title": "Bank Statement (28-Day Rule)", "description": "Showing required living expenses + tuition held consecutively for 28 days", "is_mandatory": true},
    {"title": "TB (Tuberculosis) Test Certificate", "description": "From IOM approved test center", "is_mandatory": true, "expiry_required": true},
    {"title": "English Language Qualification (IELTS UKVI)", "description": "SELT IELTS UKVI or equivalent certificate", "is_mandatory": true, "expiry_required": true},
    {"title": "Academic Certificates listed on CAS", "description": "Degree certificates and marksheets evaluated for CAS issuance", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL,
  'AU',
  'Student Visa',
  'Australia Student Visa (Subclass 500)',
  '[
    {"title": "Valid Passport", "description": "Valid passport bio page", "is_mandatory": true, "expiry_required": true},
    {"title": "Confirmation of Enrolment (CoE)", "description": "Official electronic CoE issued by Australian education provider", "is_mandatory": true},
    {"title": "Genuine Student (GS) Statement", "description": "Written statement addressing genuine study intent and circumstances", "is_mandatory": true},
    {"title": "Overseas Student Health Cover (OSHC)", "description": "Health insurance policy certificate covering total visa duration", "is_mandatory": true, "expiry_required": true},
    {"title": "Evidence of Financial Capacity", "description": "Proof of funds covering 1 year living cost + tuition + travel", "is_mandatory": true},
    {"title": "English Test Results (IELTS / PTE)", "description": "Valid score report", "is_mandatory": true, "expiry_required": true}
  ]'::jsonb
),
(
  NULL,
  'US',
  'F-1 Visa',
  'USA F-1 Academic Student Visa',
  '[
    {"title": "Passport Bio-Page", "description": "Valid for travel to the US, at least 6 months beyond intended stay", "is_mandatory": true, "expiry_required": true},
    {"title": "Form I-20 (Certificate of Eligibility)", "description": "Signed Form I-20 issued by SEVP-approved school", "is_mandatory": true},
    {"title": "SEVIS I-901 Fee Payment Receipt", "description": "Confirmation receipt for SEVIS fee payment", "is_mandatory": true},
    {"title": "DS-160 Confirmation Page", "description": "Nonimmigrant visa electronic application confirmation barcode", "is_mandatory": true},
    {"title": "Financial Affidavit & Bank Statements", "description": "Sufficient liquid funds to cover 1st year expenses listed on I-20", "is_mandatory": true},
    {"title": "Standardized Test Scores (GRE / GMAT / TOEFL / IELTS)", "description": "Score reports sent to university", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL,
  'EU',
  'Schengen Visa',
  'Schengen Tourist / Business Visa (Short-stay Type C)',
  '[
    {"title": "Passport", "description": "Issued within the last 10 years, valid for at least 3 months after departure", "is_mandatory": true, "expiry_required": true},
    {"title": "Travel Medical Insurance", "description": "Minimum coverage EUR 30,000 covering all Schengen member states", "is_mandatory": true, "expiry_required": true},
    {"title": "Flight Reservation / Itinerary", "description": "Roundtrip flight reservation showing entry and exit dates", "is_mandatory": true},
    {"title": "Proof of Accommodation (Hotel / Invitation)", "description": "Confirmed hotel bookings or registered invitation letter", "is_mandatory": true},
    {"title": "Bank Statements (Last 3-6 Months)", "description": "Stamped by bank showing regular income and sufficient balance", "is_mandatory": true},
    {"title": "Employment / Business Proof & Leave Letter", "description": "NOC / Leave approval letter from employer or trade license", "is_mandatory": true}
  ]'::jsonb
);
```

### 1.2 TypeScript Interfaces in `src/types/index.ts`

```typescript
// ============================================================
// Visa Document Checklists & Verification Hub
// ============================================================

export type DocumentStatus = 'missing' | 'submitted' | 'verified' | 'rejected';

export interface ChecklistTemplateItem {
  title: string;
  description?: string;
  is_mandatory: boolean;
  accepted_formats?: string[];
  expiry_required?: boolean;
}

export interface VisaChecklistTemplate {
  id: string;
  account_id?: string | null;
  country_code: string;
  visa_category: string;
  name: string;
  default_items: ChecklistTemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface ContactDocument {
  id: string;
  account_id: string;
  contact_id: string;
  visa_category: string;
  title: string;
  description?: string | null;
  is_mandatory: boolean;
  status: DocumentStatus;
  rejection_reason?: string | null;
  file_url?: string | null;
  message_id?: string | null;
  expiry_date?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplyTemplatePayload {
  template_id: string;
  visa_category?: string;
}

export interface CreateContactDocumentPayload {
  title: string;
  description?: string;
  visa_category: string;
  is_mandatory?: boolean;
  status?: DocumentStatus;
  file_url?: string;
  message_id?: string;
  expiry_date?: string;
}

export interface UpdateContactDocumentPayload {
  status?: DocumentStatus;
  rejection_reason?: string | null;
  file_url?: string | null;
  message_id?: string | null;
  expiry_date?: string | null;
  title?: string;
  description?: string | null;
  is_mandatory?: boolean;
}
```

---

## Segment 2: Backend Business Logic & API Layer

### 2.1 WhatsApp Chaser Generator: `src/lib/immigration/checklist-formatter.ts`

```typescript
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
```

### 2.2 API Route: `src/app/api/visa-templates/route.ts`
- `GET`: Returns list of all templates available to the account (`account_id IS NULL OR account_id = ctx.accountId`).

### 2.3 API Route: `src/app/api/contacts/[id]/documents/route.ts`
- `GET`: Return all document checklist items for the contact.
- `POST`:
  - If `template_id` provided: fetch template items and batch-insert into `contact_documents` for this contact.
  - If `title` provided: insert single custom `contact_document`.
- `PATCH`: Update document (`status`, `rejection_reason`, `file_url`, `message_id`, `expiry_date`). If status changes to `verified`, automatically set `verified_at = now()` and `verified_by = ctx.userId`.
- `DELETE`: Delete document item by id (`?documentId=...`).

---

## Segment 3: Document Hub Component in Inbox Sidebar

### 3.1 Component Architecture: `src/components/inbox/document-checklist-sidebar.tsx`

1. **Header & Progress Bar**:
   - Stream Selector (shows current stream name or dropdown to apply a template).
   - Progress meter with percentage and status counters:
     `[============      ] 65% (4 Verified, 1 Review, 1 Rejected, 2 Missing)`
   - `+ Custom Document` button.
2. **Category & Status Badges**:
   - Each card displays title, mandatory indicator (`*`), and interactive badge:
     - 🟢 `Verified` + Expiry date (highlighted in red if expired or expiring within 30 days).
     - 🟡 `Submitted` + "Review" button.
     - 🔴 `Rejected` + Rejection note callout.
     - ⚪ `Missing` + Upload/Attach shortcut.
3. **Quick Card Actions**:
   - Preview attachment.
   - Quick Approve / Verify.
   - Quick Reject (triggers rejection reason input).
   - Edit Expiry Date.
   - Remove item.
4. **Footer Action**:
   - `[ 📲 Send Missing Items Reminder ]` (calls composer prefill).

### 3.2 Dual-Tab Sidebar: `src/components/inbox/contact-sidebar.tsx`
- Adds a sleek top tab bar:
  - `[ 👤 Details ]` (Existing Tags, Deals, Notes).
  - `[ 📄 Visa Docs (4/7) ]` (Document Checklist Hub).
- Allows counselors to fluidly switch without cluttering the screen.

---

## Segment 4: Document Verification & Lightbox Modal

### 4.1 Component: `src/components/inbox/document-verification-dialog.tsx`
- Accessible via "Review" button or clicking any attached file.
- **Split Preview Layout**:
  - **Left Area**: Live preview of image or embedded PDF viewer with zoom controls.
  - **Right Area**:
    - Document title and requirements description.
    - **One-Click Approval**:
      - Optional Expiry Date picker (with auto-suggested duration for passports, IELTS, PCC).
      - `[ ✅ Approve & Mark Verified ]` button.
    - **One-Click Rejection**:
      - Quick Reason Chips:
        - `📷 Blurry / Illegible image`
        - `✂️ Cut-off edges / Incomplete pages`
        - `📅 Expired certificate`
        - `🏛️ Missing official bank stamp / seal`
        - `👤 Name does not match passport`
      - Freeform rejection notes textarea.
      - `[ ⚠️ Reject Document ]` button.

---

## Segment 5: In-Chat Quick Attach for Inbound WhatsApp Media

### 5.1 Component: `src/components/inbox/attach-to-checklist-modal.tsx`
- When a customer sends an image or PDF in WhatsApp:
  - In `message-actions.tsx` and on the media bubble, show an **"Attach to Checklist"** icon button.
  - Clicking opens the `AttachToChecklistModal`.
  - Lists the contact's pending checklist items (missing or rejected items prioritized).
  - Clicking a document requirement links `file_url = message.media_url` and `message_id = message.id`, sets `status = 'submitted'`, and triggers a success toast:
    `"Attached to 'Passport Bio-Page' (Status updated to Submitted)"`.

---

## Segment 6: 1-Click WhatsApp Chaser & Composer Integration

### 6.1 Flow Integration:
1. Counselor clicks `[ 📲 Send Missing Items Reminder ]` in the Document Sidebar.
2. `generateWhatsAppDocumentChaser()` builds the personalized update message.
3. Passes the generated message to `MessageComposer`'s draft state (or dispatches a pre-fill event).
4. The message composer fills with the ready-to-send text and focuses the textarea.
5. Counselor can inspect, add custom greetings, and press Enter to send.

---

## Segment 7: Internationalization (i18n)

Update `messages/en.json` and `messages/ko.json` with keys under `Inbox.checklist`:
- `stream`, `applyTemplate`, `verified`, `submitted`, `rejected`, `missing`, `sendReminder`, `attachToChecklist`, `expiryDate`, `rejectionReason`, `approve`, `reject`, `mandatory`, `optional`.

---

## Segment 8: Testing & Verification Matrix

| Test Suite | Scope | Command |
| :--- | :--- | :--- |
| **Unit Tests** | `src/lib/immigration/checklist-formatter.test.ts` (formatter outputs for verified, rejected, missing, and mixed scenarios) | `npm test` |
| **Typecheck** | Full TypeScript type validation for all new models and components | `npm run typecheck` |
| **Build Check** | Next.js production build verification | `npm run build` |

---

## 4. File-by-File Summary

| File Path | Action | Description |
| :--- | :--- | :--- |
| `supabase/migrations/039_visa_document_checklists.sql` | **[NEW]** | SQL Migration with tables, RLS, indexes & starter templates |
| `src/types/index.ts` | **[MODIFY]** | Added `DocumentStatus`, `ContactDocument`, `VisaChecklistTemplate` |
| `src/lib/immigration/checklist-formatter.ts` | **[NEW]** | Formatter for WhatsApp structured reminder message |
| `src/lib/immigration/checklist-formatter.test.ts` | **[NEW]** | Unit tests for checklist formatter |
| `src/app/api/visa-templates/route.ts` | **[NEW]** | GET endpoint for visa checklist templates |
| `src/app/api/contacts/[id]/documents/route.ts` | **[NEW]** | GET / POST / PATCH / DELETE endpoint for contact checklist |
| `src/components/inbox/contact-sidebar.tsx` | **[MODIFY]** | Tabbed switcher hosting Details & Visa Documents |
| `src/components/inbox/document-checklist-sidebar.tsx` | **[NEW]** | Visual checklist hub with progress meter and item cards |
| `src/components/inbox/document-verification-dialog.tsx` | **[NEW]** | Review modal with file preview, expiry tracking & rejection chips |
| `src/components/inbox/attach-to-checklist-modal.tsx` | **[NEW]** | Link inbound chat media bubble to a checklist item |
| `src/components/inbox/message-actions.tsx` | **[MODIFY]** | Add "Attach to Checklist" action on inbound media bubbles |
| `messages/en.json` & `messages/ko.json` | **[MODIFY]** | English and Korean localization strings |
