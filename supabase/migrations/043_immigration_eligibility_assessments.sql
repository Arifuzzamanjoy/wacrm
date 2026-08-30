-- ============================================================
-- 043_immigration_eligibility_assessments.sql
-- Immigration Eligibility & CRS Calculator Assessment History
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_eligibility_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('canada_crs', 'australia_points', 'uk_visa', 'lead_score')),
  total_score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 600,
  tier TEXT NOT NULL CHECK (tier IN ('high_priority', 'moderate', 'alternative_pathway', 'eligible', 'ineligible', 'hot', 'warm', 'cold')),
  tier_label TEXT NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation TEXT,
  formatted_summary TEXT,
  sent_to_whatsapp BOOLEAN NOT NULL DEFAULT false,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_eligibility_assessments_contact ON contact_eligibility_assessments(contact_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_assessments_account ON contact_eligibility_assessments(account_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_assessments_type ON contact_eligibility_assessments(assessment_type);
CREATE INDEX IF NOT EXISTS idx_eligibility_assessments_created_at ON contact_eligibility_assessments(created_at DESC);

-- Enable Multi-Tenant Row Level Security (RLS)
ALTER TABLE contact_eligibility_assessments ENABLE ROW LEVEL SECURITY;

-- RLS: Viewers and above can read assessments in their account
DROP POLICY IF EXISTS eligibility_assessments_select ON contact_eligibility_assessments;
CREATE POLICY eligibility_assessments_select ON contact_eligibility_assessments FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- RLS: Agents and above can create/modify assessments in their account
DROP POLICY IF EXISTS eligibility_assessments_modify ON contact_eligibility_assessments;
CREATE POLICY eligibility_assessments_modify ON contact_eligibility_assessments FOR ALL
  USING (is_account_member(account_id, 'agent'));
