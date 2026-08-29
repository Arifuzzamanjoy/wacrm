-- ============================================================
-- 042_automated_compliance_expiry_engine.sql
-- Automated Document Expiry & Compliance Monitoring Engine
-- ============================================================

-- Table 1: Document Expiry Alert Audit Table (ensures idempotency per threshold window)
CREATE TABLE IF NOT EXISTS document_expiry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES contact_documents(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  alert_tier TEXT NOT NULL CHECK (alert_tier IN ('90_days', '60_days', '30_days', '7_days', 'expired', 'manual')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'in_app', 'both')),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed')),
  whatsapp_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, alert_tier)
);

CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_doc ON document_expiry_alerts(document_id);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_contact ON document_expiry_alerts(contact_id);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_account ON document_expiry_alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_sent_at ON document_expiry_alerts(sent_at DESC);

ALTER TABLE document_expiry_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_expiry_alerts_select ON document_expiry_alerts;
CREATE POLICY document_expiry_alerts_select ON document_expiry_alerts FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS document_expiry_alerts_modify ON document_expiry_alerts;
CREATE POLICY document_expiry_alerts_modify ON document_expiry_alerts FOR ALL
  USING (is_account_member(account_id, 'agent'));

-- Table 2: Account Compliance Settings
CREATE TABLE IF NOT EXISTS account_compliance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  auto_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_thresholds INT[] NOT NULL DEFAULT '{90, 60, 30, 7}',
  whatsapp_template_name TEXT,
  whatsapp_template_language TEXT DEFAULT 'en_US',
  custom_message_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_settings_account ON account_compliance_settings(account_id);

ALTER TABLE account_compliance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_settings_select ON account_compliance_settings;
CREATE POLICY compliance_settings_select ON account_compliance_settings FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS compliance_settings_modify ON account_compliance_settings;
CREATE POLICY compliance_settings_modify ON account_compliance_settings FOR ALL
  USING (is_account_member(account_id, 'admin'));

-- Update notifications table type check to permit document expiry notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('conversation_assigned', 'document_expiring', 'document_expired'));
