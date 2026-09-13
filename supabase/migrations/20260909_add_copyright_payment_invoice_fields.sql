alter table soundpub.copyright_registration_payments
  add column if not exists xendit_invoice_id text,
  add column if not exists xendit_invoice_url text;

create unique index if not exists copyright_registration_payments_xendit_invoice_id_idx
  on soundpub.copyright_registration_payments (xendit_invoice_id)
  where xendit_invoice_id is not null;
