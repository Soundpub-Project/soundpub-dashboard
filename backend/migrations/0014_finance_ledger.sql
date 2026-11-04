-- Backend-only financial primitives. No legacy balances or production rows imported.
CREATE TABLE soundpub.finance_accounts (
  owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  currency text NOT NULL CHECK (currency = 'IDR'),
  PRIMARY KEY(owner_id, currency)
);
CREATE TABLE soundpub.finance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  currency text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT',
    'PAYOUT_RESERVATION','PAYOUT_RELEASE','PAYOUT_SETTLEMENT','PAYMENT_CHARGE','PAYMENT_REFUND')),
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0 AND amount_minor BETWEEN -999999999999999999 AND 999999999999999999),
  business_reference text NOT NULL CHECK (length(business_reference) BETWEEN 1 AND 240),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 240),
  actor_id uuid REFERENCES soundpub.backend_users(id),
  system_actor text CHECK (length(system_actor) BETWEEN 1 AND 100),
  evidence text CHECK (length(evidence) BETWEEN 1 AND 240),
  old_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,currency) REFERENCES soundpub.finance_accounts(owner_id,currency),
  CHECK (num_nonnulls(actor_id,system_actor)=1),
  CHECK (kind IN ('ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT') OR amount_minor > 0),
  CHECK (kind NOT IN ('PAYOUT_SETTLEMENT','PAYMENT_CHARGE','PAYMENT_REFUND') OR evidence IS NOT NULL),
  UNIQUE(owner_id,currency,idempotency_key),
  UNIQUE(owner_id,currency,kind,business_reference)
);
CREATE UNIQUE INDEX finance_one_reservation_terminal ON soundpub.finance_events(owner_id,currency,business_reference)
  WHERE kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT');
CREATE UNIQUE INDEX finance_unique_evidence ON soundpub.finance_events(kind,evidence) WHERE evidence IS NOT NULL;
CREATE INDEX finance_event_account ON soundpub.finance_events(owner_id,currency,created_at);

CREATE TABLE soundpub.finance_audit (
  event_id uuid PRIMARY KEY REFERENCES soundpub.finance_events(id),
  old_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  outbox_id uuid NOT NULL UNIQUE REFERENCES soundpub.outbox_events(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION soundpub.finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_IMMUTABLE';
END;
$$;
CREATE TRIGGER finance_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.finance_events
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER finance_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.finance_audit
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

CREATE FUNCTION soundpub.finance_guard_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  available numeric; reserved numeric; settled numeric;
  available_delta bigint := 0; reserved_delta bigint := 0; settled_delta bigint := 0;
  original bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_READ_COMMITTED_REQUIRED';
  END IF;
  -- All writers lock identical persistent account rows; no mutable balance authority.
  PERFORM 1 FROM soundpub.finance_accounts WHERE owner_id=NEW.owner_id AND currency=NEW.currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ACCOUNT_REQUIRED'; END IF;
  SELECT COALESCE(sum(CASE WHEN kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT','PAYOUT_RELEASE') THEN amount_minor
      WHEN kind='PAYOUT_RESERVATION' THEN -amount_minor ELSE 0 END),0),
    COALESCE(sum(CASE WHEN kind='PAYOUT_RESERVATION' THEN amount_minor
      WHEN kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT') THEN -amount_minor ELSE 0 END),0),
    COALESCE(sum(CASE WHEN kind='PAYOUT_SETTLEMENT' THEN amount_minor ELSE 0 END),0)
    INTO available,reserved,settled FROM soundpub.finance_events WHERE owner_id=NEW.owner_id AND currency=NEW.currency;
  IF NEW.kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT') THEN available_delta := NEW.amount_minor;
  ELSIF NEW.kind='PAYOUT_RESERVATION' THEN available_delta := -NEW.amount_minor; reserved_delta := NEW.amount_minor;
  ELSIF NEW.kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT') THEN
    SELECT amount_minor INTO original FROM soundpub.finance_events
      WHERE owner_id=NEW.owner_id AND currency=NEW.currency AND kind='PAYOUT_RESERVATION' AND business_reference=NEW.business_reference;
    IF original IS NULL OR original <> NEW.amount_minor OR EXISTS (
      SELECT 1 FROM soundpub.finance_events WHERE owner_id=NEW.owner_id AND currency=NEW.currency
        AND business_reference=NEW.business_reference AND kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_RESERVATION_CONFLICT';
    END IF;
    reserved_delta := -NEW.amount_minor;
    IF NEW.kind='PAYOUT_RELEASE' THEN available_delta := NEW.amount_minor; ELSE settled_delta := NEW.amount_minor; END IF;
  ELSIF NEW.kind='PAYMENT_REFUND' THEN
    SELECT amount_minor INTO original FROM soundpub.finance_events
      WHERE owner_id=NEW.owner_id AND currency=NEW.currency AND kind='PAYMENT_CHARGE' AND business_reference=NEW.business_reference;
    -- One full refund per charge until partial refund allocation rules are approved.
    IF original IS NULL OR original <> NEW.amount_minor THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_REFUND_CONFLICT';
    END IF;
  END IF;
  IF available + available_delta < 0 OR reserved + reserved_delta < 0 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_INSUFFICIENT_BALANCE';
  END IF;
  NEW.old_state:=jsonb_build_object('availableMinor',available::text,'reservedMinor',reserved::text,'settledMinor',settled::text);
  NEW.new_state:=jsonb_build_object('availableMinor',(available+available_delta)::text,
    'reservedMinor',(reserved+reserved_delta)::text,'settledMinor',(settled+settled_delta)::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_event_guard BEFORE INSERT ON soundpub.finance_events
  FOR EACH ROW EXECUTE FUNCTION soundpub.finance_guard_event();

CREATE FUNCTION soundpub.finance_record_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE outbox uuid;
BEGIN
  INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
    VALUES ('finance.event',jsonb_build_object('eventId',NEW.id), 'finance:' || NEW.id::text) RETURNING id INTO outbox;
  INSERT INTO soundpub.finance_audit(event_id,old_state,new_state,outbox_id) VALUES (NEW.id,NEW.old_state,NEW.new_state,outbox);
  INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
    VALUES (NEW.actor_id,NEW.kind,'finance_event',NEW.id::text,NEW.idempotency_key,
      jsonb_build_object('ownerId',NEW.owner_id,'amountMinor',NEW.amount_minor::text,'currency',NEW.currency,
        'businessReference',NEW.business_reference,'systemActor',NEW.system_actor,'oldState',NEW.old_state,'newState',NEW.new_state));
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_event_record AFTER INSERT ON soundpub.finance_events
  FOR EACH ROW EXECUTE FUNCTION soundpub.finance_record_event();

ALTER TABLE soundpub.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.finance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.finance_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_accounts_backend ON soundpub.finance_accounts TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY finance_events_backend ON soundpub.finance_events TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY finance_audit_backend ON soundpub.finance_audit TO soundpub_app USING (true) WITH CHECK (true);
REVOKE ALL ON soundpub.finance_accounts,soundpub.finance_events,soundpub.finance_audit FROM PUBLIC;
GRANT SELECT,INSERT ON soundpub.finance_accounts,soundpub.finance_events,soundpub.finance_audit TO soundpub_app;
-- SELECT FOR UPDATE requires UPDATE privilege on at least one account column; values remain immutable.
GRANT UPDATE(currency) ON soundpub.finance_accounts TO soundpub_app;
CREATE TRIGGER finance_accounts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.finance_accounts
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
REVOKE ALL ON FUNCTION soundpub.finance_immutable(),soundpub.finance_guard_event(),soundpub.finance_record_event() FROM PUBLIC;
