-- ============================================================
-- 050_external_agent.sql — external (n8n) agent as an AI provider
--
-- Lets an account point its AI assistant at its own agent workflow
-- (an n8n webhook) instead of calling OpenAI / Anthropic / Groq
-- directly. wacrm still owns the WhatsApp number, the inbox, and every
-- auto-reply safety gate; the external agent is only asked "what should
-- we say next?" over a signed HTTPS request.
--
--   1. ai_configs.provider           — allow 'n8n'.
--      ai_configs.agent_url          — the agent's webhook URL. For
--                                      provider 'n8n', `api_key` holds
--                                      the shared signing secret
--                                      (encrypted like every other key).
--   2. ai_configs.handoff_timeout_hours
--                                    — when set, a bot handoff releases
--                                      itself after this many hours with
--                                      no human reply. NULL keeps the
--                                      existing sticky behaviour.
--      conversations.ai_handoff_at   — when the bot handed off. Only bot
--                                      handoffs are stamped, so a manual
--                                      "pause AI" never auto-expires.
--   3. ai_configs.agent_deal_pipeline_id / agent_deal_stage_id
--                                    — where a deal lands when the agent
--                                      reports a qualified lead. Both
--                                      NULL = never create deals.
--   4. contacts.ad_referral / ad_referral_at
--                                    — first-touch click-to-WhatsApp ad
--                                      attribution. Never overwritten.
--      messages.referral             — the referral block on the exact
--                                      inbound message that carried it.
--   5. ai_usage_log.provider         — the CHECK still only allowed
--                                      openai/anthropic, so every Groq
--                                      usage insert was silently failing.
--                                      Widened to the full provider set.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Provider + agent URL -------------------------------------------------
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq', 'n8n'));

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS agent_url text;

-- 2. Handoff time limit ---------------------------------------------------
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS handoff_timeout_hours integer;

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_handoff_timeout_hours_check;
ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_handoff_timeout_hours_check
  CHECK (handoff_timeout_hours IS NULL OR handoff_timeout_hours BETWEEN 1 AND 720);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_handoff_at timestamptz;

-- 3. Deal target for qualified leads ---------------------------------------
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS agent_deal_pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL;

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS agent_deal_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL;

-- 4. Click-to-WhatsApp ad attribution --------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ad_referral jsonb;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ad_referral_at timestamptz;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS referral jsonb;

-- 5. Usage log provider set ------------------------------------------------
ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq', 'n8n'));
