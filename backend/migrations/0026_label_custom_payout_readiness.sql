-- BACKEND_ONLY_RLS_OPTIONAL: private backend authority; additive, no historical rewrites.
CREATE TABLE soundpub.pic_payout_destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 currency text NOT NULL CHECK(currency='IDR'),
 bank_name text NOT NULL CHECK(length(btrim(bank_name)) BETWEEN 1 AND 200),
 account_number text NOT NULL CHECK(account_number ~ '^[0-9]{4,40}$'),
 account_holder_name text NOT NULL CHECK(length(btrim(account_holder_name)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE soundpub.pic_destination_verifications (
 destination_id uuid PRIMARY KEY REFERENCES soundpub.pic_payout_destinations(id),
 actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE soundpub.pic_reconciliation_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 currency text NOT NULL CHECK(currency='IDR'),
 snapshot jsonb NOT NULL,
 evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 1 AND 200),
 actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(actor_id<>owner_id)
);
CREATE TABLE soundpub.pic_readiness_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 destination_id uuid REFERENCES soundpub.pic_destination_verifications(destination_id),
 approval_id uuid REFERENCES soundpub.pic_reconciliation_approvals(id),
 actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(destination_id,approval_id)=1),
 UNIQUE(destination_id), UNIQUE(approval_id)
);
CREATE INDEX pic_destination_latest ON soundpub.pic_payout_destinations(owner_id,currency,created_at DESC,id DESC);
CREATE INDEX pic_approval_owner ON soundpub.pic_reconciliation_approvals(owner_id,currency);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['pic_payout_destinations','pic_destination_verifications','pic_reconciliation_approvals','pic_readiness_revocations'] LOOP
 EXECUTE format('REVOKE ALL ON soundpub.%I FROM PUBLIC,soundpub_app',t);
 EXECUTE format('GRANT SELECT,INSERT ON soundpub.%I TO soundpub_app',t);
 EXECUTE format('CREATE TRIGGER readiness_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.%I FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable()',t);
 END LOOP;
END $$;
-- Review identity and PIC ownership are checked again at database boundary.
CREATE FUNCTION soundpub.pic_readiness_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE owner uuid; reviewer uuid;
BEGIN
 IF TG_TABLE_NAME='pic_payout_destinations' THEN owner:=NEW.owner_id;
 ELSIF TG_TABLE_NAME='pic_reconciliation_approvals' THEN owner:=NEW.owner_id; reviewer:=NEW.actor_id;
 ELSIF TG_TABLE_NAME='pic_destination_verifications' THEN
   SELECT owner_id INTO owner FROM soundpub.pic_payout_destinations WHERE id=NEW.destination_id;
   reviewer:=NEW.actor_id;
 ELSE
   IF NEW.destination_id IS NOT NULL THEN
     SELECT d.owner_id INTO owner FROM soundpub.pic_payout_destinations d WHERE d.id=NEW.destination_id;
   ELSE
     SELECT a.owner_id INTO owner FROM soundpub.pic_reconciliation_approvals a WHERE a.id=NEW.approval_id;
   END IF;
   reviewer:=NEW.actor_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM soundpub.label_custom_units unit
   JOIN soundpub.backend_users u ON u.id=unit.owner_user_id
   JOIN soundpub.user_roles role ON role.user_id=u.id AND role.role='label_custom' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL
   WHERE u.id=owner AND u.status='active' AND unit.status='active') THEN
   RAISE EXCEPTION 'ACTIVE_PIC_UNIT_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF reviewer IS NOT NULL AND (reviewer=owner OR NOT EXISTS(
   SELECT 1 FROM soundpub.backend_users u JOIN soundpub.user_roles role ON role.user_id=u.id
   WHERE u.id=reviewer AND u.status='active' AND role.role IN ('admin','superadmin') AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'INDEPENDENT_ADMIN_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.pic_readiness_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER pic_destination_guard BEFORE INSERT ON soundpub.pic_payout_destinations
 FOR EACH ROW EXECUTE FUNCTION soundpub.pic_readiness_guard();
CREATE TRIGGER pic_verification_guard BEFORE INSERT ON soundpub.pic_destination_verifications
 FOR EACH ROW EXECUTE FUNCTION soundpub.pic_readiness_guard();
CREATE TRIGGER pic_approval_guard BEFORE INSERT ON soundpub.pic_reconciliation_approvals
 FOR EACH ROW EXECUTE FUNCTION soundpub.pic_readiness_guard();
CREATE TRIGGER pic_revocation_guard BEFORE INSERT ON soundpub.pic_readiness_revocations
 FOR EACH ROW EXECUTE FUNCTION soundpub.pic_readiness_guard();
