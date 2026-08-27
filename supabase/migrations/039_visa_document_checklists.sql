-- ============================================================
-- 039_visa_document_checklists.sql
-- Visa Document Checklist & Verification Hub
-- ============================================================

-- Table 1: Visa Checklist Templates (Presets per country & visa stream)
CREATE TABLE IF NOT EXISTS visa_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE, -- NULL for global system templates
  country_code TEXT NOT NULL, -- e.g. 'CA', 'UK', 'AU', 'US', 'EU'
  visa_category TEXT NOT NULL, -- e.g. 'Study Permit', 'Student Visa', 'F-1 Visa', 'Schengen Visa'
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
