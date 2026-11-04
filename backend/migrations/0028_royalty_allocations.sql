-- BACKEND_ONLY_RLS_OPTIONAL: private backend schema, no Data API grants.
-- Keep legacy entry ownership as a compatibility snapshot while introducing
-- immutable component allocations as the financial source of truth.
ALTER TABLE soundpub.royalty_import_entries
  ADD COLUMN calculation_policy_code text,
  ADD COLUMN label_owner_user_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT;

ALTER TABLE soundpub.royalty_import_entries DISABLE TRIGGER royalty_entries_immutable;
UPDATE soundpub.royalty_import_entries
SET calculation_policy_code='BACKEND_SINGLE_OWNER_V1';
ALTER TABLE soundpub.royalty_import_entries ENABLE TRIGGER royalty_entries_immutable;
ALTER TABLE soundpub.royalty_import_entries
  ALTER COLUMN calculation_policy_code SET NOT NULL,
  ADD CONSTRAINT royalty_entry_policy_code_nonempty
    CHECK (length(btrim(calculation_policy_code)) BETWEEN 1 AND 100);

CREATE TABLE soundpub.royalty_import_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES soundpub.royalty_import_entries(id) ON DELETE RESTRICT,
  component text NOT NULL CHECK (component IN ('ARTIST','LABEL','SOUNDPUB','COMPOSER','LEGACY_OWNER')),
  owner_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  policy_code text NOT NULL CHECK (length(btrim(policy_code)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT royalty_allocation_owner_shape CHECK (
    (component='SOUNDPUB' AND owner_id IS NULL)
    OR (component<>'SOUNDPUB' AND owner_id IS NOT NULL)
  )
);
CREATE INDEX royalty_import_allocations_entry ON soundpub.royalty_import_allocations(entry_id);
CREATE INDEX royalty_import_allocations_owner ON soundpub.royalty_import_allocations(owner_id,entry_id)
  WHERE owner_id IS NOT NULL;

-- Preserve every historical financial posting exactly. Zero-value entries need
-- no child row because the deferred sum invariant treats no allocations as zero.
INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code)
SELECT id,'LEGACY_OWNER',financial_owner_user_id,net_amount,'BACKEND_SINGLE_OWNER_V1'
FROM soundpub.royalty_import_entries
WHERE net_amount > 0;

CREATE FUNCTION soundpub.royalty_allocation_sum_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE target_entry uuid; expected numeric(18,2); allocated numeric(18,2);
BEGIN
  IF TG_TABLE_NAME='royalty_import_entries' THEN
    target_entry := NEW.id;
  ELSE
    target_entry := NEW.entry_id;
  END IF;
  SELECT e.net_amount INTO expected FROM soundpub.royalty_import_entries e WHERE e.id=target_entry;
  IF expected IS NULL THEN
    RAISE EXCEPTION 'ROYALTY_ALLOCATION_ENTRY_REQUIRED' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(a.amount),0)::numeric(18,2) INTO allocated
  FROM soundpub.royalty_import_allocations a WHERE a.entry_id=target_entry;
  IF allocated IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ROYALTY_ALLOCATION_SUM_MISMATCH' USING ERRCODE='23514',
      DETAIL=format('entry=%s expected=%s allocated=%s',target_entry,expected,allocated);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_allocation_sum_guard() FROM PUBLIC,soundpub_app;
CREATE CONSTRAINT TRIGGER royalty_entry_allocation_sum
  AFTER INSERT ON soundpub.royalty_import_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.royalty_allocation_sum_guard();
CREATE CONSTRAINT TRIGGER royalty_allocation_entry_sum
  AFTER INSERT ON soundpub.royalty_import_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.royalty_allocation_sum_guard();

REVOKE ALL ON soundpub.royalty_import_allocations FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.royalty_import_allocations TO soundpub_app;
CREATE TRIGGER royalty_allocations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.royalty_import_allocations FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.finance_immutable();
ALTER TABLE soundpub.royalty_import_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_allocations_backend ON soundpub.royalty_import_allocations
  TO soundpub_app USING (true) WITH CHECK (true);

