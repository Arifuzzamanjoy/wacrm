-- ============================================================
-- 044_generalize_document_checklists.sql
-- Generalize the Visa Document Checklist & Verification Hub into an
-- industry-agnostic "Document Collection & Verification Hub".
--
-- Immigration remains the flagship vertical (its templates ship
-- seeded and unchanged), but the schema no longer *assumes* it.
-- Follows the same generalization convention already established by
-- 040_case_contact_linking.sql: a free-text type field, a JSONB
-- metadata escape hatch, and generic vocabulary documented with
-- per-industry examples.
--
-- Renames (data preserved in place):
--   visa_checklist_templates      -> checklist_templates
--   .country_code                 -> .region_code   (now nullable)
--   .visa_category                -> .category
--   contact_documents.visa_category -> .category
--
-- Additions:
--   checklist_templates.industry  -- vertical the template belongs to
--   checklist_templates.metadata  -- industry-specific extras
--   contact_documents.metadata    -- industry-specific extras
--   contact_documents.status      -- new 'waived' state (a.k.a. "N/A")
--   accounts.industry             -- the agency's own vertical
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rename the templates table (idempotent)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'visa_checklist_templates')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'checklist_templates')
  THEN
    ALTER TABLE visa_checklist_templates RENAME TO checklist_templates;
  END IF;
END $$;

-- Guard for a database where 039 never created the table (a restored
-- snapshot, a hand-pruned schema). Columns are declared with the 039
-- names so the rename block below is the single place that owns the
-- new naming, whichever path got us here. `contact_documents` is not
-- recreated here — it comes from 039 and migrations run in order.
CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE, -- NULL = global system template
  country_code TEXT,
  visa_category TEXT,
  name TEXT NOT NULL,
  default_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Rename the vertical-specific columns (idempotent)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'checklist_templates'
               AND column_name = 'country_code')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'checklist_templates'
                       AND column_name = 'region_code')
  THEN
    ALTER TABLE checklist_templates RENAME COLUMN country_code TO region_code;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'checklist_templates'
               AND column_name = 'visa_category')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'checklist_templates'
                       AND column_name = 'category')
  THEN
    ALTER TABLE checklist_templates RENAME COLUMN visa_category TO category;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'contact_documents'
               AND column_name = 'visa_category')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'contact_documents'
                       AND column_name = 'category')
  THEN
    ALTER TABLE contact_documents RENAME COLUMN visa_category TO category;
  END IF;
END $$;

-- region_code is immigration-only ("CA", "UK", "AU"). A marketing or
-- e-commerce checklist has no region, so the NOT NULL from 039 has to go.
ALTER TABLE checklist_templates ALTER COLUMN region_code DROP NOT NULL;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE checklist_templates ALTER COLUMN category DROP NOT NULL;

-- ------------------------------------------------------------
-- 3. Add the generalization columns
-- ------------------------------------------------------------

-- The vertical a template serves. Free-text (like cases.case_type in
-- 040) rather than an enum so an agency can coin its own vertical
-- without a migration. Known values used by the seeded templates and
-- the UI grouping:
--   immigration, real_estate, insurance, finance, legal, healthcare,
--   education, recruitment, marketing, ecommerce, general
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'general';

ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE contact_documents
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The agency's own vertical, used to surface the most relevant
-- templates first. NULL = not yet chosen; the UI shows all verticals.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS industry TEXT;

-- Everything seeded by 039 is immigration.
UPDATE checklist_templates
   SET industry = 'immigration'
 WHERE account_id IS NULL
   AND industry = 'general'
   AND region_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_industry
  ON checklist_templates(industry);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_account
  ON checklist_templates(account_id);

-- ------------------------------------------------------------
-- 4. Add the 'waived' document status
--
-- Industry-standard document-collection tools (Content Snare,
-- FileInvite, Clustdoc) all expose a "not applicable / waived" state
-- so a client can retire a requirement that does not apply to them
-- without it counting as missing forever. 039 shipped only
-- missing/submitted/verified/rejected.
-- ------------------------------------------------------------
ALTER TABLE contact_documents DROP CONSTRAINT IF EXISTS contact_documents_status_check;
ALTER TABLE contact_documents ADD CONSTRAINT contact_documents_status_check
  CHECK (status IN ('missing', 'submitted', 'verified', 'rejected', 'waived'));

-- ------------------------------------------------------------
-- 5. Re-point RLS policies at the renamed table
-- ------------------------------------------------------------
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visa_checklist_templates_select ON checklist_templates;
DROP POLICY IF EXISTS visa_checklist_templates_modify ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_select ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_modify ON checklist_templates;

CREATE POLICY checklist_templates_select ON checklist_templates FOR SELECT
  USING (account_id IS NULL OR is_account_member(account_id, 'viewer'));

CREATE POLICY checklist_templates_modify ON checklist_templates FOR ALL
  USING (account_id IS NOT NULL AND is_account_member(account_id, 'admin'));

-- Backwards-compatible read alias for any external API consumer still
-- selecting the 039 table/column names. New code must use the
-- generalized names; this view exists only so an old integration
-- doesn't hard-fail on deploy.
DROP VIEW IF EXISTS visa_checklist_templates;
CREATE VIEW visa_checklist_templates AS
  SELECT id,
         account_id,
         region_code  AS country_code,
         category     AS visa_category,
         name,
         default_items,
         created_at,
         updated_at
    FROM checklist_templates
   WHERE industry = 'immigration';

-- ------------------------------------------------------------
-- 6. Make global-template seeding idempotent
--
-- 039 seeded with a bare INSERT, so re-running it duplicated rows.
-- A partial unique index on the global templates lets every seed
-- below use ON CONFLICT DO NOTHING.
-- ------------------------------------------------------------
DELETE FROM checklist_templates a
 USING checklist_templates b
 WHERE a.account_id IS NULL
   AND b.account_id IS NULL
   AND a.name = b.name
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_templates_global_name
  ON checklist_templates(name) WHERE account_id IS NULL;

-- ------------------------------------------------------------
-- 7. Seed cross-industry starter templates
--
-- Deliberately sized for small/mid agencies: short, plain-language
-- checklists that work on day one rather than exhaustive compliance
-- matrices. Immigration templates from 039 are left untouched.
-- ------------------------------------------------------------
INSERT INTO checklist_templates (account_id, industry, region_code, category, name, default_items)
VALUES
(
  NULL, 'marketing', NULL, 'Client Onboarding',
  'Marketing Agency - New Client Onboarding',
  '[
    {"title": "Signed Service Agreement / SOW", "description": "Countersigned scope of work covering deliverables, timeline and fees", "is_mandatory": true},
    {"title": "Brand Guidelines & Logo Files", "description": "Vector logo (SVG/AI), colour palette, typography and usage rules", "is_mandatory": true},
    {"title": "Ad Account & Analytics Access", "description": "Partner/admin access to Meta Business, Google Ads and GA4", "is_mandatory": true},
    {"title": "Website & CMS Credentials", "description": "Admin or editor login for the site the campaign points to", "is_mandatory": true},
    {"title": "Target Audience & Positioning Brief", "description": "Personas, key messages, competitors and tone of voice", "is_mandatory": true},
    {"title": "Product / Service Photography", "description": "High-resolution creative assets cleared for paid use", "is_mandatory": false},
    {"title": "Past Campaign Performance Data", "description": "Historic spend and results to benchmark against", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'ecommerce', NULL, 'Seller Onboarding',
  'E-commerce - Seller / Vendor Verification',
  '[
    {"title": "Business Registration Certificate", "description": "Trade licence or incorporation certificate for the selling entity", "is_mandatory": true, "expiry_required": true},
    {"title": "Tax Registration (VAT / GST / TIN)", "description": "Tax identification certificate for invoicing and remittance", "is_mandatory": true},
    {"title": "Owner Government Photo ID", "description": "Passport or national ID of the beneficial owner", "is_mandatory": true, "expiry_required": true},
    {"title": "Bank Account Proof for Payouts", "description": "Cancelled cheque or bank letter matching the registered entity name", "is_mandatory": true},
    {"title": "Product Catalogue & Pricing Sheet", "description": "SKU list with pricing, stock and shipping dimensions", "is_mandatory": true},
    {"title": "Brand Authorisation / Reseller Letter", "description": "Required when listing third-party branded goods", "is_mandatory": false, "expiry_required": true},
    {"title": "Product Compliance Certificates", "description": "Safety, CE/FCC or import certificates for regulated categories", "is_mandatory": false, "expiry_required": true}
  ]'::jsonb
),
(
  NULL, 'real_estate', NULL, 'Property Transaction',
  'Real Estate - Buyer / Tenant File',
  '[
    {"title": "Government Photo ID", "description": "Passport or driving licence for every named party", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Address", "description": "Utility bill or bank statement issued within the last 3 months", "is_mandatory": true},
    {"title": "Mortgage Agreement in Principle", "description": "Lender decision in principle or proof of cash funds", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Deposit Funds", "description": "Bank statements evidencing the deposit and its source", "is_mandatory": true},
    {"title": "Employment / Income Verification", "description": "Recent payslips, employer letter or accounts if self-employed", "is_mandatory": true},
    {"title": "Signed Offer / Tenancy Agreement", "description": "Executed contract between the parties", "is_mandatory": true},
    {"title": "Property Survey / Inspection Report", "description": "Structural survey or condition report", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'insurance', NULL, 'Policy Application',
  'Insurance - Policy Application & Claim File',
  '[
    {"title": "Completed Proposal Form", "description": "Signed application form with full disclosure", "is_mandatory": true},
    {"title": "Policyholder Photo ID", "description": "Government-issued identification", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Insurable Interest", "description": "Ownership, registration or title document for the insured asset", "is_mandatory": true},
    {"title": "Medical Report / Health Declaration", "description": "Required for life and health cover above the free-limit", "is_mandatory": false, "expiry_required": true},
    {"title": "Nominee / Beneficiary Details & ID", "description": "Identification and relationship proof for each nominee", "is_mandatory": true},
    {"title": "Previous Policy & No-Claims Proof", "description": "Expiring policy schedule and claims history for renewals", "is_mandatory": false, "expiry_required": true},
    {"title": "Premium Payment Receipt", "description": "Proof of first premium payment to activate cover", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'finance', NULL, 'Loan Application',
  'Finance - Loan / Mortgage Application',
  '[
    {"title": "Government Photo ID", "description": "Passport or national identity card", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Address", "description": "Utility bill or bank statement from the last 3 months", "is_mandatory": true},
    {"title": "Bank Statements (Last 6 Months)", "description": "Full statements for all operating accounts", "is_mandatory": true},
    {"title": "Income Proof (Payslips / Tax Returns)", "description": "3 months payslips, or 2 years returns if self-employed", "is_mandatory": true},
    {"title": "Employment Verification Letter", "description": "Employer letter confirming role, tenure and salary", "is_mandatory": true},
    {"title": "Existing Liabilities Statement", "description": "Outstanding loans, cards and commitments", "is_mandatory": false},
    {"title": "Collateral / Asset Documents", "description": "Title deeds or valuation for any pledged security", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'recruitment', NULL, 'Candidate Onboarding',
  'Recruitment / HR - Candidate Onboarding',
  '[
    {"title": "Signed Offer Letter / Contract", "description": "Countersigned employment agreement", "is_mandatory": true},
    {"title": "Government Photo ID", "description": "Passport or national ID for identity verification", "is_mandatory": true, "expiry_required": true},
    {"title": "Right to Work / Work Permit", "description": "Visa, work permit or residency proof where applicable", "is_mandatory": true, "expiry_required": true},
    {"title": "Tax & Payroll Forms", "description": "Tax declaration and payroll enrolment forms", "is_mandatory": true},
    {"title": "Bank Details for Salary", "description": "Bank letter or cancelled cheque in the employee name", "is_mandatory": true},
    {"title": "Educational Certificates", "description": "Degree or diploma certificates claimed on the CV", "is_mandatory": true},
    {"title": "Reference Letters", "description": "Two professional references from previous employers", "is_mandatory": false},
    {"title": "Background Check Consent", "description": "Signed authorisation for criminal and credit screening", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'legal', NULL, 'Client Matter',
  'Legal - New Client Matter Intake',
  '[
    {"title": "Signed Engagement Letter", "description": "Retainer agreement setting out scope and fees", "is_mandatory": true},
    {"title": "Client Photo ID (KYC)", "description": "Government identification for anti-money-laundering checks", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Address (KYC)", "description": "Document dated within the last 3 months", "is_mandatory": true},
    {"title": "Case Documents & Correspondence", "description": "Contracts, notices and letters relevant to the matter", "is_mandatory": true},
    {"title": "Court Filings / Case Reference", "description": "Existing pleadings or case number if proceedings have begun", "is_mandatory": false},
    {"title": "Signed Authority / Power of Attorney", "description": "Authorisation to act on the client behalf", "is_mandatory": false},
    {"title": "Conflict Check Confirmation", "description": "Internal sign-off that no conflict of interest exists", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'healthcare', NULL, 'Patient Intake',
  'Healthcare - Patient Intake File',
  '[
    {"title": "Completed Registration Form", "description": "Demographics and emergency contact details", "is_mandatory": true},
    {"title": "Photo ID", "description": "Government identification for patient matching", "is_mandatory": true, "expiry_required": true},
    {"title": "Insurance Card / Payer Details", "description": "Active coverage card, both sides", "is_mandatory": true, "expiry_required": true},
    {"title": "Medical History & Medication List", "description": "Conditions, allergies and current prescriptions", "is_mandatory": true},
    {"title": "Referral Letter", "description": "Referring physician letter where required by the payer", "is_mandatory": false},
    {"title": "Prior Test Results & Imaging", "description": "Recent labs, scans or specialist reports", "is_mandatory": false},
    {"title": "Signed Consent & Privacy Forms", "description": "Treatment consent and data-privacy acknowledgement", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'education', NULL, 'Student Admission',
  'Education - Student Admission File',
  '[
    {"title": "Completed Application Form", "description": "Signed admission application", "is_mandatory": true},
    {"title": "Academic Transcripts", "description": "Certified transcripts for all prior study", "is_mandatory": true},
    {"title": "Graduation Certificates", "description": "Degree or school-leaving certificates", "is_mandatory": true},
    {"title": "Photo ID / Birth Certificate", "description": "Identity and date-of-birth verification", "is_mandatory": true, "expiry_required": true},
    {"title": "English / Entrance Test Scores", "description": "IELTS, TOEFL or institutional entrance test results", "is_mandatory": false, "expiry_required": true},
    {"title": "Personal Statement", "description": "Statement of purpose or motivation letter", "is_mandatory": false},
    {"title": "Fee Payment Receipt", "description": "Proof of application or enrolment fee payment", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'general', NULL, 'Client Onboarding',
  'General - Client Onboarding Starter',
  '[
    {"title": "Signed Agreement / Contract", "description": "Executed agreement between both parties", "is_mandatory": true},
    {"title": "Government Photo ID", "description": "Identification for the primary contact", "is_mandatory": true, "expiry_required": true},
    {"title": "Business Registration", "description": "Trade licence or incorporation certificate, if a company", "is_mandatory": false, "expiry_required": true},
    {"title": "Billing & Payment Details", "description": "Bank or card details for invoicing", "is_mandatory": true},
    {"title": "Project Brief / Requirements", "description": "Written scope of what the client needs", "is_mandatory": true},
    {"title": "Supporting Files", "description": "Any additional documents relevant to the engagement", "is_mandatory": false}
  ]'::jsonb
)
ON CONFLICT (name) WHERE account_id IS NULL DO NOTHING;
