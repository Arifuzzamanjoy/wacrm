-- ============================================================
-- 037_ai_provider_groq.sql
--
-- Relax the provider check constraint to allow 'groq' as a valid AI provider.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_provider_check CHECK (provider IN ('openai', 'anthropic', 'groq'));
