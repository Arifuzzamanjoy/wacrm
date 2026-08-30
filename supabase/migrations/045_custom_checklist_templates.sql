-- ============================================================
-- 045_custom_checklist_templates.sql
-- Let accounts author their own checklist templates.
--
-- 039 seeded five global immigration templates (account_id IS NULL)
-- and 044 generalized them across industries, but nothing could ever
-- create an account-owned row: there was no API, and the RLS from 039
-- was never exercised for writes. An agency running spousal
-- sponsorship, work permits, visitor visas or PR had no way to capture
-- those streams.
--
-- This migration makes account-owned templates a first-class row:
--   * a uniqueness rule scoped per account (039's index covered only
--     the global rows),
--   * RLS split per verb with an explicit WITH CHECK, so an admin can
--     only ever write rows belonging to their own account,
--   * updated_at maintained on write.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Per-account name uniqueness
--
-- 044 added `idx_checklist_templates_global_name ... WHERE account_id
-- IS NULL`, which deliberately covers only the seeded global rows.
-- Account rows had no constraint at all, so an agency could save
-- "Work Permit" twice and get two indistinguishable picker entries.
-- ------------------------------------------------------------
DELETE FROM checklist_templates a
 USING checklist_templates b
 WHERE a.account_id IS NOT NULL
   AND a.account_id = b.account_id
   AND a.name = b.name
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_templates_account_name
  ON checklist_templates(account_id, name)
  WHERE account_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Split the RLS policies per verb
--
-- 039/044 used a single `FOR ALL ... USING (...)` policy. Postgres
-- falls back to the USING expression as the WITH CHECK for INSERT when
-- none is given, so writes did technically work — but relying on that
-- fallback is easy to break, and it left no room to keep DELETE
-- stricter than UPDATE. Spelling each verb out makes the intent
-- explicit and the INSERT check unmissable.
--
-- Reads stay wide (every member sees the global catalogue plus their
-- own account's). Writes are admin-only and can never target another
-- account, because both USING and WITH CHECK pin account_id.
-- ------------------------------------------------------------
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_select ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_modify ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_insert ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_update ON checklist_templates;
DROP POLICY IF EXISTS checklist_templates_delete ON checklist_templates;

CREATE POLICY checklist_templates_select ON checklist_templates FOR SELECT
  USING (account_id IS NULL OR is_account_member(account_id, 'viewer'));

-- WITH CHECK only: there is no existing row to test on an INSERT.
-- `account_id IS NOT NULL` is what stops an account from minting a row
-- into the global (NULL) catalogue every other account can see.
CREATE POLICY checklist_templates_insert ON checklist_templates FOR INSERT
  WITH CHECK (
    account_id IS NOT NULL AND is_account_member(account_id, 'admin')
  );

-- USING gates which rows may be updated; WITH CHECK gates what they may
-- become — without the latter an admin could re-point one of their own
-- rows at another account_id.
CREATE POLICY checklist_templates_update ON checklist_templates FOR UPDATE
  USING (
    account_id IS NOT NULL AND is_account_member(account_id, 'admin')
  )
  WITH CHECK (
    account_id IS NOT NULL AND is_account_member(account_id, 'admin')
  );

CREATE POLICY checklist_templates_delete ON checklist_templates FOR DELETE
  USING (
    account_id IS NOT NULL AND is_account_member(account_id, 'admin')
  );

-- ------------------------------------------------------------
-- 3. Keep updated_at honest
--
-- The column has defaulted since 039 but was only ever set on insert,
-- so an edited template still advertised its creation time. The
-- trigger function already exists (used by accounts and others).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON checklist_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
