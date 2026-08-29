-- ============================================================
-- 040_case_contact_linking.sql
-- Generalized Case & Contact Group Linking
-- ============================================================

-- Table 1: Cases (generalized container that groups contacts)
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,  -- auto-generated: "CASE-2026-0001"
  title TEXT NOT NULL,        -- e.g. "Khan Family - Canada PR", "Smith Property Deal"
  case_type TEXT NOT NULL,    -- free-text: "Visa Application", "Insurance Policy", "Property Deal", etc.
  description TEXT,
  primary_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'in_progress', 'submitted', 'approved', 'completed', 'closed', 'on_hold', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,  -- flexible key-value for industry-specific fields (country, visa_category, policy_number, property_address, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_account ON cases(account_id);
CREATE INDEX IF NOT EXISTS idx_cases_primary_contact ON cases(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(case_type);

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cases_select ON cases;
CREATE POLICY cases_select ON cases FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS cases_insert ON cases;
CREATE POLICY cases_insert ON cases FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS cases_update ON cases;
CREATE POLICY cases_update ON cases FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS cases_delete ON cases;
CREATE POLICY cases_delete ON cases FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Table 2: Case Members (links contacts to cases with roles)
CREATE TABLE IF NOT EXISTS case_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary'
    CHECK (role IN (
      'primary',        -- Main applicant / policyholder / buyer / patient / student / client
      'spouse',         -- Spouse / partner
      'child',          -- Child / dependent minor
      'parent',         -- Parent / guardian
      'co_applicant',   -- Co-buyer, co-sponsor, co-defendant
      'dependent',      -- Generic dependent (insurance, visa)
      'nominee',        -- Insurance nominee, emergency contact
      'guarantor',      -- Financial guarantor, sponsor
      'representative', -- Lawyer, agent, broker, consultant
      'stakeholder',    -- Decision maker, billing contact, hiring manager
      'reference',      -- Referrer, referee, witness
      'other'           -- Catch-all
    )),
  label TEXT,             -- optional custom label: "Mother", "Business Partner", "Hiring Manager at Google"
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_case_members_case ON case_members(case_id);
CREATE INDEX IF NOT EXISTS idx_case_members_contact ON case_members(contact_id);

ALTER TABLE case_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_members_select ON case_members;
CREATE POLICY case_members_select ON case_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_members.case_id
    AND is_account_member(cases.account_id, 'viewer')
  ));

DROP POLICY IF EXISTS case_members_insert ON case_members;
CREATE POLICY case_members_insert ON case_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_members.case_id
    AND is_account_member(cases.account_id, 'agent')
  ));

DROP POLICY IF EXISTS case_members_update ON case_members;
CREATE POLICY case_members_update ON case_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_members.case_id
    AND is_account_member(cases.account_id, 'agent')
  ));

DROP POLICY IF EXISTS case_members_delete ON case_members;
CREATE POLICY case_members_delete ON case_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_members.case_id
    AND is_account_member(cases.account_id, 'agent')
  ));

-- Helper: auto-generate case_number sequence per account
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INT;
  year_str TEXT;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(split_part(case_number, '-', 3) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM cases
  WHERE account_id = NEW.account_id
    AND case_number LIKE 'CASE-' || year_str || '-%';
  NEW.case_number := 'CASE-' || year_str || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_auto_number ON cases;
CREATE TRIGGER trg_cases_auto_number
  BEFORE INSERT ON cases
  FOR EACH ROW
  WHEN (NEW.case_number IS NULL OR NEW.case_number = '')
  EXECUTE FUNCTION generate_case_number();

-- Auto-insert primary_contact as 'primary' member on case creation
CREATE OR REPLACE FUNCTION auto_add_primary_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO case_members (case_id, contact_id, role)
  VALUES (NEW.id, NEW.primary_contact_id, 'primary')
  ON CONFLICT (case_id, contact_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_auto_primary_member ON cases;
CREATE TRIGGER trg_cases_auto_primary_member
  AFTER INSERT ON cases
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_primary_member();

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_cases_updated_at();
