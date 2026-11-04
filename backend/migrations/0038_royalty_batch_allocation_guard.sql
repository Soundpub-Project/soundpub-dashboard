ALTER TABLE soundpub.royalty_import_batches
  ADD COLUMN write_xid xid8 NOT NULL DEFAULT pg_current_xact_id();

DROP TRIGGER royalty_entry_allocation_sum ON soundpub.royalty_import_entries;
DROP TRIGGER royalty_allocation_entry_sum ON soundpub.royalty_import_allocations;
DROP FUNCTION soundpub.royalty_allocation_sum_guard();

CREATE FUNCTION soundpub.royalty_batch_allocation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  entry_count integer;
  entry_total numeric(24,2);
  allocation_total numeric(24,2);
  artist_total numeric(24,2);
  label_total numeric(24,2);
  soundpub_total numeric(24,2);
  owner_mismatches integer;
BEGIN
  SELECT count(*)::integer,COALESCE(sum(entry.net_amount),0)::numeric(24,2)
  INTO entry_count,entry_total
  FROM soundpub.royalty_import_entries entry WHERE entry.batch_id=NEW.id;

  IF entry_count=0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(allocation.amount),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='ARTIST'),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='LABEL'),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='SOUNDPUB'),0)::numeric(24,2),
    count(*) FILTER (WHERE
      (allocation.component='ARTIST' AND allocation.owner_id IS DISTINCT FROM entry.financial_owner_user_id)
      OR (allocation.component='LABEL' AND allocation.owner_id IS DISTINCT FROM entry.label_owner_user_id)
      OR (allocation.component='SOUNDPUB' AND allocation.owner_id IS NOT NULL)
      OR (allocation.component='LEGACY_OWNER' AND allocation.owner_id IS DISTINCT FROM entry.beneficiary_id))::integer
  INTO allocation_total,artist_total,label_total,soundpub_total,owner_mismatches
  FROM soundpub.royalty_import_entries entry
  JOIN soundpub.royalty_import_allocations allocation ON allocation.entry_id=entry.id
  WHERE entry.batch_id=NEW.id;

  IF entry_count IS DISTINCT FROM NEW.row_count
    OR entry_total IS DISTINCT FROM NEW.total_amount
    OR allocation_total IS DISTINCT FROM NEW.total_amount
    OR (NEW.validation_result->>'policy_code'= 'SOUNDPUB_LEGACY_70_21_9' AND (
      artist_total IS DISTINCT FROM (NEW.validation_result->>'artist_amount')::numeric
      OR label_total IS DISTINCT FROM (NEW.validation_result->>'label_amount')::numeric
      OR soundpub_total IS DISTINCT FROM (NEW.validation_result->>'soundpub_amount')::numeric))
    OR owner_mismatches <> 0 THEN
    RAISE EXCEPTION 'ROYALTY_ALLOCATION_SUM_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_batch_allocation_guard() FROM PUBLIC,soundpub_app;

CREATE CONSTRAINT TRIGGER royalty_batch_allocation_sum
  AFTER INSERT ON soundpub.royalty_import_batches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.royalty_batch_allocation_guard();

CREATE FUNCTION soundpub.royalty_entry_write_window_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_entries inserted
    JOIN soundpub.royalty_import_batches batch ON batch.id=inserted.batch_id
    WHERE batch.write_xid IS DISTINCT FROM pg_current_xact_id()
      AND EXISTS (
        SELECT 1 FROM soundpub.royalty_import_entries existing
        WHERE existing.batch_id=inserted.batch_id
          AND NOT EXISTS (SELECT 1 FROM new_entries current_insert WHERE current_insert.id=existing.id)
      )
  ) THEN
    RAISE EXCEPTION 'ROYALTY_BATCH_CLOSED' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_entry_write_window_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_entry_write_window
  AFTER INSERT ON soundpub.royalty_import_entries
  REFERENCING NEW TABLE AS new_entries FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.royalty_entry_write_window_guard();

CREATE FUNCTION soundpub.royalty_allocation_write_window_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_allocations inserted
    JOIN soundpub.royalty_import_entries entry ON entry.id=inserted.entry_id
    JOIN soundpub.royalty_import_batches batch ON batch.id=entry.batch_id
    WHERE batch.write_xid IS DISTINCT FROM pg_current_xact_id()
      AND entry.xmin::text IS DISTINCT FROM pg_current_xact_id()::text
  ) THEN
    RAISE EXCEPTION 'ROYALTY_BATCH_CLOSED' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_allocation_write_window_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_allocation_write_window
  AFTER INSERT ON soundpub.royalty_import_allocations
  REFERENCING NEW TABLE AS new_allocations FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.royalty_allocation_write_window_guard();
