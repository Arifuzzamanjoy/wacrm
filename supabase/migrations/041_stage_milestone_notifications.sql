-- ============================================================
-- 041_stage_milestone_notifications.sql
-- Milestone-Triggered WhatsApp Status Updates & Stage History
-- ============================================================

-- 1. Add whatsapp_notification config column to pipeline_stages
ALTER TABLE pipeline_stages
ADD COLUMN IF NOT EXISTS whatsapp_notification JSONB DEFAULT NULL;

-- 2. Create deal_stage_history table for auditing stage movements & notification delivery
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  notification_template TEXT,
  whatsapp_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_account ON deal_stage_history(account_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_created_at ON deal_stage_history(created_at DESC);

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_stage_history_select ON deal_stage_history;
CREATE POLICY deal_stage_history_select ON deal_stage_history FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS deal_stage_history_insert ON deal_stage_history;
CREATE POLICY deal_stage_history_insert ON deal_stage_history FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
