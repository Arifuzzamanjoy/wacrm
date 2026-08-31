-- ============================================================
-- 049_case_number_concurrency.sql
--
-- Hardens the case-number generator introduced in 040.
--
-- Two problems with the original:
--
--   1. Race. It read MAX(seq) and wrote MAX+1 with nothing serialising
--      concurrent inserts, so two agents creating a case for the same
--      account in the same instant both computed the same number and
--      the second hit `cases_account_id_case_number_key`. Two users on
--      one busy account is enough to trigger it. A transaction-scoped
--      advisory lock keyed on the account makes the read-then-write
--      atomic without blocking other accounts.
--
--   2. Fragile parse. `split_part(case_number, '-', 3)::INT` raises
--      22P02 on any row whose number doesn't match the generated shape
--      — a hand-inserted or imported case_number is enough to break
--      every subsequent insert for that account. The LIKE filter is now
--      a regex that guarantees the cast can succeed.
--
-- Both functions also gain an explicit `search_path`, matching the
-- convention the rest of the schema follows (see 017/018/019).
-- ============================================================

CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_seq INT;
  year_str TEXT;
BEGIN
  year_str := to_char(now(), 'YYYY');

  -- Serialise number allocation per account for the rest of this
  -- transaction. Released automatically on commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtext('cases.case_number:' || NEW.account_id::text));

  SELECT COALESCE(MAX(CAST(split_part(case_number, '-', 3) AS INT)), 0) + 1
  INTO next_seq
  FROM cases
  WHERE account_id = NEW.account_id
    AND case_number ~ ('^CASE-' || year_str || '-[0-9]+$');

  NEW.case_number := 'CASE-' || year_str || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auto_add_primary_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO case_members (case_id, contact_id, role)
  VALUES (NEW.id, NEW.primary_contact_id, 'primary')
  ON CONFLICT (case_id, contact_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
