-- ============================================================
-- 048_ai_provider_groq.sql
--
-- Renumbered from 037, which collided with 037_webhook_broadcast_reliability.sql
-- upstream. Two files sharing a number makes apply order undefined; the
-- statements below are idempotent, so re-running under the new number is
-- safe on a database that already has the old one applied.
--
-- Relax the provider check constraint to allow 'groq' as a valid AI provider.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_provider_check CHECK (provider IN ('openai', 'anthropic', 'groq'));
