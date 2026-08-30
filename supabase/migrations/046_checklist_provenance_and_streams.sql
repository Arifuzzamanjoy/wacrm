-- ============================================================
-- 046_checklist_provenance_and_streams.sql
--
-- Two things, both deliberately additive:
--
--   1. Provenance on applied checklists — which template a contact's
--      documents came from, and when. Read-only signal: it powers a
--      "this template has changed since you applied it" badge.
--
--      This is NOT template syncing, and deliberately so. Applied rows
--      carry real verification state (verified_at, verified_by,
--      rejection_reason, uploaded file_url), so retroactively renaming
--      or deleting them on a template edit would mutate the record of
--      what was actually asked of, and approved for, a client. The
--      copy-on-apply semantics stay: an applied checklist is a record
--      of what you asked this client for, at the time you asked it.
--      All this adds is the ability to *notice* drift and act on it
--      per contact, via the existing "Add Doc" control.
--
--   2. More seeded immigration streams. 039 shipped five templates,
--      all study/visitor. An agency also runs sponsorship, work
--      permits and PR — those are the case types that were missing.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Provenance columns
--
-- ON DELETE SET NULL, not CASCADE: deleting a template must never
-- delete a client's documents. Losing the link just means we can no
-- longer report drift for that checklist, which is the correct
-- degradation.
-- ------------------------------------------------------------
ALTER TABLE contact_documents
  ADD COLUMN IF NOT EXISTS template_id UUID
    REFERENCES checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE contact_documents
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

-- Rows created before this migration have no provenance. Backfilling
-- applied_at from created_at is honest — that IS when the checklist was
-- applied — while template_id stays NULL because it cannot be
-- recovered. A NULL template_id simply means "no drift reporting", not
-- an error.
UPDATE contact_documents
   SET applied_at = created_at
 WHERE applied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_documents_template
  ON contact_documents(template_id)
  WHERE template_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Additional immigration streams
--
-- Structured per *case type* rather than per country: a consultancy
-- works a spousal sponsorship file differently from a work permit,
-- even though both are Canada. region_code carries the country so the
-- picker can prefix it, and the name carries the stream.
--
-- Uses the partial unique index from 044 so re-running is a no-op.
-- ------------------------------------------------------------
INSERT INTO checklist_templates (account_id, industry, region_code, category, name, default_items)
VALUES
(
  NULL, 'immigration', 'CA', 'Spousal Sponsorship',
  'Canada Spousal / Common-Law Sponsorship',
  '[
    {"title": "Sponsor Passport / Citizenship or PR Card", "description": "Proof of the sponsor status in Canada", "is_mandatory": true, "expiry_required": true},
    {"title": "Applicant Passport Bio-Page", "description": "Clear scan, valid at least 6 months", "is_mandatory": true, "expiry_required": true},
    {"title": "Marriage Certificate or Proof of Common-Law", "description": "Registered certificate, or 12 months cohabitation evidence", "is_mandatory": true},
    {"title": "Relationship Evidence Package", "description": "Photos together, chat logs, call records, travel history spanning the relationship", "is_mandatory": true},
    {"title": "Joint Financial / Cohabitation Proof", "description": "Joint accounts, shared lease or utility bills, mail to a shared address", "is_mandatory": true},
    {"title": "Sponsor Notice of Assessment (Last 3 Years)", "description": "CRA NOAs evidencing the sponsor is not in default", "is_mandatory": true},
    {"title": "Sponsorship Undertaking & Agreement (IMM 1344)", "description": "Signed by both sponsor and applicant", "is_mandatory": true},
    {"title": "Police Clearance Certificate", "description": "From every country lived in 6+ months since age 18", "is_mandatory": true, "expiry_required": true},
    {"title": "Upfront Medical Examination (eMedical)", "description": "Information sheet from a panel physician", "is_mandatory": true, "expiry_required": true},
    {"title": "Statutory Declaration of Common-Law Union (IMM 5409)", "description": "Only for common-law applications", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'immigration', 'CA', 'Work Permit',
  'Canada Work Permit (LMIA-Based)',
  '[
    {"title": "Passport Bio-Page", "description": "Valid beyond the intended period of employment", "is_mandatory": true, "expiry_required": true},
    {"title": "Positive LMIA Decision Letter", "description": "Copy of the employer LMIA approval with its file number", "is_mandatory": true, "expiry_required": true},
    {"title": "Signed Employment Contract", "description": "Matching the wage and duties stated on the LMIA", "is_mandatory": true},
    {"title": "Proof of Qualifications for the Role", "description": "Degrees, trade certificates or licences the NOC requires", "is_mandatory": true},
    {"title": "Reference Letters from Past Employers", "description": "On letterhead, stating role, dates, hours and duties", "is_mandatory": true},
    {"title": "Language Test Results (IELTS / CELPIP)", "description": "Where the employer or the NOC requires it", "is_mandatory": false, "expiry_required": true},
    {"title": "Police Clearance Certificate", "description": "Issued within the last 6 months", "is_mandatory": false, "expiry_required": true},
    {"title": "Upfront Medical Examination", "description": "Required for healthcare, childcare and agricultural roles", "is_mandatory": false, "expiry_required": true}
  ]'::jsonb
),
(
  NULL, 'immigration', 'CA', 'Visitor Visa',
  'Canada Visitor Visa / TRV',
  '[
    {"title": "Passport Bio-Page", "description": "Valid at least 6 months beyond the intended stay", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Funds (Last 6 Months)", "description": "Bank statements showing consistent balance and income", "is_mandatory": true},
    {"title": "Employment / Business Proof & Leave Letter", "description": "NOC or leave approval, or trade licence if self-employed", "is_mandatory": true},
    {"title": "Travel Itinerary & Accommodation", "description": "Flight reservation and hotel bookings or host address", "is_mandatory": true},
    {"title": "Invitation Letter from Host", "description": "With the host status in Canada, where visiting family or friends", "is_mandatory": false},
    {"title": "Proof of Ties to Home Country", "description": "Property deeds, family, ongoing employment — evidence of intent to return", "is_mandatory": true},
    {"title": "Purpose of Travel Letter", "description": "Explaining the visit, its duration and who funds it", "is_mandatory": true},
    {"title": "Previous Travel History / Old Visas", "description": "Pages showing prior visas and entry stamps", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'immigration', 'CA', 'Permanent Residence',
  'Canada Express Entry (PR)',
  '[
    {"title": "Passport Bio-Page", "description": "For the principal applicant and every accompanying family member", "is_mandatory": true, "expiry_required": true},
    {"title": "Educational Credential Assessment (ECA)", "description": "WES, IQAS or equivalent, valid at the time of submission", "is_mandatory": true, "expiry_required": true},
    {"title": "Language Test Results (IELTS General / CELPIP)", "description": "Valid for 2 years from the test date", "is_mandatory": true, "expiry_required": true},
    {"title": "Work Experience Reference Letters", "description": "On letterhead with NOC duties, hours per week and salary", "is_mandatory": true},
    {"title": "Proof of Settlement Funds", "description": "Official bank letter meeting the current IRCC threshold for the family size", "is_mandatory": true},
    {"title": "Police Clearance Certificates", "description": "From every country lived in 6+ months since age 18", "is_mandatory": true, "expiry_required": true},
    {"title": "Upfront Medical Examination (eMedical)", "description": "For every applicant, including dependants", "is_mandatory": true, "expiry_required": true},
    {"title": "Marriage Certificate / Birth Certificates", "description": "Civil status and relationship proof for accompanying dependants", "is_mandatory": false},
    {"title": "Provincial Nomination Certificate", "description": "Where applying under a PNP stream", "is_mandatory": false, "expiry_required": true},
    {"title": "Digital Photos to IRCC Specification", "description": "For each applicant, meeting the size and background rules", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'immigration', 'UK', 'Work Visa',
  'UK Skilled Worker Visa',
  '[
    {"title": "Current Valid Passport", "description": "With a blank page for the vignette", "is_mandatory": true, "expiry_required": true},
    {"title": "Certificate of Sponsorship (CoS)", "description": "Reference number issued by a licensed UK sponsor", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of English Language", "description": "SELT, or a degree taught in English with UK NARIC confirmation", "is_mandatory": true, "expiry_required": true},
    {"title": "Bank Statement (28-Day Rule)", "description": "Maintenance funds held consecutively, unless the sponsor certifies them", "is_mandatory": true},
    {"title": "TB Test Certificate", "description": "From an approved clinic, where required for the applicant country", "is_mandatory": false, "expiry_required": true},
    {"title": "Criminal Record Certificate", "description": "Required for healthcare, education and social care roles", "is_mandatory": false, "expiry_required": true},
    {"title": "Qualifications Named on the CoS", "description": "Degree certificates and transcripts", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'immigration', 'AU', 'Permanent Residence',
  'Australia Skilled Independent (Subclass 189)',
  '[
    {"title": "Passport Bio-Page", "description": "For the applicant and all accompanying members", "is_mandatory": true, "expiry_required": true},
    {"title": "Positive Skills Assessment", "description": "From the assessing authority for the nominated occupation", "is_mandatory": true, "expiry_required": true},
    {"title": "English Test Results (IELTS / PTE)", "description": "Meeting at least Competent English", "is_mandatory": true, "expiry_required": true},
    {"title": "Employment Reference Letters", "description": "Evidencing the claimed years of skilled experience", "is_mandatory": true},
    {"title": "Qualification Certificates & Transcripts", "description": "As relied on in the skills assessment", "is_mandatory": true},
    {"title": "Police Clearance Certificates", "description": "From every country lived in 12+ months in the last 10 years", "is_mandatory": true, "expiry_required": true},
    {"title": "Health Examination (My Health Declarations)", "description": "For every applicant", "is_mandatory": true, "expiry_required": true},
    {"title": "Partner Skills / English Evidence", "description": "Only where claiming partner points", "is_mandatory": false}
  ]'::jsonb
)
ON CONFLICT (name) WHERE account_id IS NULL DO NOTHING;
