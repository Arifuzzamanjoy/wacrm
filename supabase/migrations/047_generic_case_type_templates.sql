-- ============================================================
-- 047_generic_case_type_templates.sql
--
-- Country-neutral checklists, and the ability to hide built-ins.
--
-- Every immigration template shipped so far is bound to a country:
-- [CA] Study Permit, [UK] Student Visa, [AU] Subclass 500. That suits
-- a consultancy working one corridor, but an agency handling "all
-- types of immigration cases" wants to start from the *case type* —
-- study, work, visit, sponsorship, PR, business — and fill in the
-- country specifics per client.
--
-- The documents that actually repeat across every corridor are the
-- generic ones: passport, funds, qualifications, police clearance,
-- medical, photos. Those are what these templates carry. The
-- country-specific instruments (a Canadian GIC, a UK CAS, an
-- Australian CoE) stay in the country templates, which remain
-- available for anyone who wants them.
--
--   1. Six country-neutral templates, region_code NULL so the picker
--      renders them without a [XX] prefix.
--   2. accounts.hidden_checklist_template_ids — lets an agency hide
--      built-ins it never uses, so the picker shows only what it works
--      with. Hiding is per account and reversible; the global rows are
--      shared, so they are never deleted.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Per-account hiding of built-in templates
--
-- An array on accounts rather than a join table: the list is short
-- (bounded by the number of built-ins), read on every picker load, and
-- never queried from the other direction.
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS hidden_checklist_template_ids UUID[]
  NOT NULL DEFAULT '{}'::uuid[];

-- ------------------------------------------------------------
-- 2. Country-neutral case-type templates
--
-- Named without a country and with region_code NULL, so they sort and
-- render ahead of the corridor-specific ones. Seeded global via the
-- partial unique index from 044, so re-running is a no-op.
-- ------------------------------------------------------------
INSERT INTO checklist_templates (account_id, industry, region_code, category, name, default_items)
VALUES
(
  NULL, 'immigration', NULL, 'Study',
  'Study Visa',
  '[
    {"title": "Passport Bio-Page", "description": "Clear scan, valid for the full intended stay", "is_mandatory": true, "expiry_required": true},
    {"title": "Offer / Acceptance Letter from Institution", "description": "Official admission letter naming the programme and start date", "is_mandatory": true},
    {"title": "Proof of Tuition & Living Funds", "description": "Bank statements, sponsorship letter or education loan covering the first year", "is_mandatory": true},
    {"title": "Academic Transcripts & Certificates", "description": "All prior qualifications, certified where required", "is_mandatory": true},
    {"title": "Language Test Results", "description": "IELTS, PTE, TOEFL or the test the destination accepts", "is_mandatory": true, "expiry_required": true},
    {"title": "Statement of Purpose", "description": "Study plan, choice of institution and intent after graduation", "is_mandatory": true},
    {"title": "Passport Photographs", "description": "Meeting the destination specification", "is_mandatory": true},
    {"title": "Medical Examination", "description": "Where the destination requires one", "is_mandatory": false, "expiry_required": true},
    {"title": "Police Clearance Certificate", "description": "From each country of long-term residence", "is_mandatory": false, "expiry_required": true},
    {"title": "Proof of Ties to Home Country", "description": "Property, family or employment evidencing intent to return", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'immigration', NULL, 'Work',
  'Work Visa / Permit',
  '[
    {"title": "Passport Bio-Page", "description": "Valid beyond the intended period of employment", "is_mandatory": true, "expiry_required": true},
    {"title": "Job Offer / Employment Contract", "description": "Signed, stating role, salary and duration", "is_mandatory": true},
    {"title": "Employer Sponsorship or Labour Approval", "description": "LMIA, CoS, nomination or the destination equivalent", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Qualifications", "description": "Degrees, trade certificates or professional licences the role requires", "is_mandatory": true},
    {"title": "Work Experience Reference Letters", "description": "On letterhead, stating role, dates, hours and duties", "is_mandatory": true},
    {"title": "Language Test Results", "description": "Where the destination or employer requires it", "is_mandatory": false, "expiry_required": true},
    {"title": "Police Clearance Certificate", "description": "From each country of long-term residence", "is_mandatory": false, "expiry_required": true},
    {"title": "Medical Examination", "description": "Common for healthcare, childcare and agricultural roles", "is_mandatory": false, "expiry_required": true},
    {"title": "Passport Photographs", "description": "Meeting the destination specification", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'immigration', NULL, 'Visit',
  'Visitor / Tourist Visa',
  '[
    {"title": "Passport Bio-Page", "description": "Typically valid 6 months beyond the intended stay", "is_mandatory": true, "expiry_required": true},
    {"title": "Proof of Funds (Last 6 Months)", "description": "Bank statements showing consistent balance and income", "is_mandatory": true},
    {"title": "Employment / Business Proof & Leave Letter", "description": "NOC or leave approval, or trade licence if self-employed", "is_mandatory": true},
    {"title": "Travel Itinerary & Accommodation", "description": "Flight reservation and hotel booking or host address", "is_mandatory": true},
    {"title": "Proof of Ties to Home Country", "description": "Property, family or ongoing employment evidencing intent to return", "is_mandatory": true},
    {"title": "Purpose of Travel Letter", "description": "Explaining the visit, its duration and who funds it", "is_mandatory": true},
    {"title": "Invitation Letter from Host", "description": "With the host status, where visiting family or friends", "is_mandatory": false},
    {"title": "Travel Medical Insurance", "description": "Where the destination requires cover", "is_mandatory": false, "expiry_required": true},
    {"title": "Previous Travel History / Old Visas", "description": "Pages showing prior visas and entry stamps", "is_mandatory": false}
  ]'::jsonb
),
(
  NULL, 'immigration', NULL, 'Family Sponsorship',
  'Family Sponsorship',
  '[
    {"title": "Sponsor Status Proof", "description": "Citizenship, PR card or residence permit of the sponsor", "is_mandatory": true, "expiry_required": true},
    {"title": "Applicant Passport Bio-Page", "description": "Clear scan for every applicant", "is_mandatory": true, "expiry_required": true},
    {"title": "Relationship Certificate", "description": "Marriage, birth or adoption certificate as applicable", "is_mandatory": true},
    {"title": "Relationship Evidence Package", "description": "Photos, correspondence, call records and travel history", "is_mandatory": true},
    {"title": "Sponsor Income & Financial Proof", "description": "Tax assessments, payslips or employment letter", "is_mandatory": true},
    {"title": "Sponsorship Undertaking Forms", "description": "Signed by sponsor and applicant", "is_mandatory": true},
    {"title": "Proof of Cohabitation or Ongoing Support", "description": "Joint accounts, shared lease or remittance history", "is_mandatory": false},
    {"title": "Police Clearance Certificate", "description": "From each country of long-term residence", "is_mandatory": true, "expiry_required": true},
    {"title": "Medical Examination", "description": "For every applicant including dependants", "is_mandatory": true, "expiry_required": true},
    {"title": "Passport Photographs", "description": "Meeting the destination specification", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'immigration', NULL, 'Permanent Residence',
  'Permanent Residence / Skilled Migration',
  '[
    {"title": "Passport Bio-Page", "description": "For the principal applicant and every accompanying member", "is_mandatory": true, "expiry_required": true},
    {"title": "Educational Credential Assessment", "description": "Assessment of foreign qualifications by the recognised authority", "is_mandatory": true, "expiry_required": true},
    {"title": "Language Test Results", "description": "Meeting the threshold for the stream applied under", "is_mandatory": true, "expiry_required": true},
    {"title": "Work Experience Reference Letters", "description": "On letterhead with duties, hours per week and salary", "is_mandatory": true},
    {"title": "Proof of Settlement Funds", "description": "Official bank letter meeting the threshold for the family size", "is_mandatory": true},
    {"title": "Police Clearance Certificates", "description": "From every country of long-term residence", "is_mandatory": true, "expiry_required": true},
    {"title": "Medical Examination", "description": "For every applicant including dependants", "is_mandatory": true, "expiry_required": true},
    {"title": "Civil Status Documents", "description": "Marriage and birth certificates for accompanying dependants", "is_mandatory": false},
    {"title": "Skills Assessment or Nomination", "description": "Where the stream requires an assessment or state nomination", "is_mandatory": false, "expiry_required": true},
    {"title": "Digital Photographs to Specification", "description": "For each applicant", "is_mandatory": true}
  ]'::jsonb
),
(
  NULL, 'immigration', NULL, 'Business',
  'Business / Investor Visa',
  '[
    {"title": "Passport Bio-Page", "description": "For the investor and accompanying family", "is_mandatory": true, "expiry_required": true},
    {"title": "Business Plan", "description": "Covering the proposed venture, market and job creation", "is_mandatory": true},
    {"title": "Proof of Investment Funds & Source", "description": "Bank statements plus a documented lawful source of funds", "is_mandatory": true},
    {"title": "Company Registration & Ownership Documents", "description": "Incorporation certificate and shareholding evidence", "is_mandatory": true},
    {"title": "Audited Financial Statements", "description": "For the existing business, typically the last 3 years", "is_mandatory": true},
    {"title": "Personal & Business Tax Returns", "description": "Evidencing declared income and compliance", "is_mandatory": true},
    {"title": "Net Worth Statement", "description": "Certified by an accountant where required", "is_mandatory": false},
    {"title": "Police Clearance Certificate", "description": "From each country of long-term residence", "is_mandatory": true, "expiry_required": true},
    {"title": "Medical Examination", "description": "Where the destination requires one", "is_mandatory": false, "expiry_required": true}
  ]'::jsonb
)
ON CONFLICT (name) WHERE account_id IS NULL DO NOTHING;
