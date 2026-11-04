CREATE TABLE soundpub.payout_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 amount numeric(20,2) NOT NULL CHECK(amount > 0),
 currency text NOT NULL CHECK(currency = 'IDR'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','failed','paid')),
 bank_name text NOT NULL CHECK(length(bank_name) BETWEEN 1 AND 200),
 account_number text NOT NULL CHECK(account_number ~ '^[0-9]{4,40}$'),
 account_holder_name text NOT NULL CHECK(length(account_holder_name) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_requests_owner_idx ON soundpub.payout_requests(user_id,created_at DESC,id DESC);
-- Persist exact source accounts; transfer never redirects an existing reservation.
CREATE TABLE soundpub.payout_allocations (
 payout_id uuid NOT NULL REFERENCES soundpub.payout_requests(id),
 owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 amount numeric(18,2) NOT NULL CHECK(amount > 0),
 PRIMARY KEY(payout_id,owner_id)
);
-- Permanent financial replay receipts; never expire or reclaim.
CREATE TABLE soundpub.payout_operations (
 actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id), key text NOT NULL CHECK(length(key) BETWEEN 1 AND 128),
 fingerprint text NOT NULL, payout_id uuid NOT NULL REFERENCES soundpub.payout_requests(id),
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,key)
);
ALTER TABLE soundpub.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.payout_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.payout_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_backend ON soundpub.payout_requests TO soundpub_app USING(true) WITH CHECK(true);
CREATE POLICY payout_operations_backend ON soundpub.payout_operations TO soundpub_app USING(true) WITH CHECK(true);
CREATE POLICY payout_allocations_backend ON soundpub.payout_allocations TO soundpub_app USING(true) WITH CHECK(true);
REVOKE ALL ON soundpub.payout_requests,soundpub.payout_operations FROM PUBLIC;
GRANT SELECT,INSERT ON soundpub.payout_requests,soundpub.payout_operations TO soundpub_app;
REVOKE ALL ON soundpub.payout_allocations FROM PUBLIC;
GRANT SELECT,INSERT ON soundpub.payout_allocations TO soundpub_app;
GRANT UPDATE(status,updated_at) ON soundpub.payout_requests TO soundpub_app;

-- Commit-time conservation: no payout can persist without exact allocation and financial evidence.
CREATE FUNCTION soundpub.payout_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p soundpub.payout_requests%ROWTYPE; total numeric; terminal text;
BEGIN
 SELECT * INTO p FROM soundpub.payout_requests WHERE id=NEW.id;
 SELECT sum(amount) INTO total FROM soundpub.payout_allocations WHERE payout_id=p.id;
 IF total IS NULL OR total<>p.amount THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYOUT_RESERVATION_MISMATCH';
 END IF;
 terminal := CASE WHEN p.status='paid' THEN 'PAYOUT_SETTLEMENT'
   WHEN p.status IN ('cancelled','failed','rejected') THEN 'PAYOUT_RELEASE' ELSE NULL END;
 IF EXISTS (SELECT 1 FROM soundpub.payout_allocations a WHERE a.payout_id=p.id AND (
   NOT EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=a.owner_id AND e.currency=p.currency
     AND e.business_reference=p.id::text AND e.kind='PAYOUT_RESERVATION' AND e.amount_minor=a.amount*100)
   OR (terminal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=a.owner_id
     AND e.currency=p.currency AND e.business_reference=p.id::text AND e.kind=terminal AND e.amount_minor=a.amount*100))
   OR (terminal IS NULL AND EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=a.owner_id
     AND e.business_reference=p.id::text AND e.kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT'))))) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYOUT_LEDGER_STATE_MISMATCH';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM soundpub.audit_logs WHERE resource_type='payout' AND resource_id=p.id::text
   AND action='payout.' || p.status) OR NOT EXISTS(SELECT 1 FROM soundpub.outbox_events
   WHERE topic='payout.changed' AND payload->>'payout_id'=p.id::text AND payload->>'new_state'=p.status) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYOUT_AUDIT_REQUIRED';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER payout_commit_guard AFTER INSERT OR UPDATE ON soundpub.payout_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION soundpub.payout_commit_guard();
REVOKE ALL ON FUNCTION soundpub.payout_commit_guard() FROM PUBLIC;
