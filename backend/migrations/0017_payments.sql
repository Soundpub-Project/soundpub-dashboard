-- Phase3E mock-only payment domain. No legacy financial rows imported.
CREATE TABLE soundpub.payment_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_type text NOT NULL DEFAULT 'release' CHECK (business_type='release'),
 business_id uuid NOT NULL UNIQUE REFERENCES soundpub.releases(id),
 provider text NOT NULL DEFAULT 'mock' CHECK (provider='mock'),
 provider_invoice_id text NOT NULL UNIQUE,
 amount_minor bigint NOT NULL CHECK (amount_minor>0 AND amount_minor<=9007199254740991),
 currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'),
 precision smallint NOT NULL DEFAULT 2 CHECK (precision=2),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
 idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
 reconciliation_required boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE soundpub.payment_mock_invoices (
 provider_invoice_id text PRIMARY KEY REFERENCES soundpub.payment_invoices(provider_invoice_id),
 amount_minor bigint NOT NULL CHECK (amount_minor>0), currency text NOT NULL CHECK (currency='IDR'),
 status text NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED'))
);
CREATE TABLE soundpub.payment_effects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES soundpub.payment_invoices(id),
 kind text NOT NULL CHECK (kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND')),
 amount_minor bigint NOT NULL CHECK (amount_minor>0), currency text NOT NULL CHECK (currency='IDR'),
 reference text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invoice_id,kind)
);
CREATE TABLE soundpub.payment_callback_receipts (
 event_id text PRIMARY KEY, provider_invoice_id text NOT NULL,
 disposition text NOT NULL CHECK (disposition IN ('applied','ignored','unknown_invoice','unsupported','mismatch','invalid_transition')),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE soundpub.payment_refunds (
 invoice_id uuid PRIMARY KEY REFERENCES soundpub.payment_invoices(id),
 idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
 actor_user_id uuid NOT NULL REFERENCES soundpub.backend_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON soundpub.payment_invoices, soundpub.payment_mock_invoices, soundpub.payment_effects,
 soundpub.payment_callback_receipts, soundpub.payment_refunds FROM PUBLIC, soundpub_app;
GRANT SELECT,INSERT ON soundpub.payment_invoices, soundpub.payment_mock_invoices, soundpub.payment_effects,
 soundpub.payment_callback_receipts, soundpub.payment_refunds TO soundpub_app;
GRANT UPDATE(status,reconciliation_required,updated_at) ON soundpub.payment_invoices TO soundpub_app;
GRANT UPDATE(status) ON soundpub.payment_mock_invoices TO soundpub_app;
-- Private soundpub schema: no anon/authenticated grants, no Data API exposure.

