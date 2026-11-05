GRANT SELECT ON soundpub.copyright_royalty_batches,soundpub.copyright_royalty_entries,
  soundpub.copyright_royalty_corrections,soundpub.copyright_royalty_reconciliations
  TO soundpub_reconciler,soundpub_auditor;
GRANT EXECUTE ON FUNCTION soundpub.copyright_royalty_batch_finance_intact(uuid),
  soundpub.copyright_royalty_correction_intact(uuid),soundpub.copyright_royalty_reconciliation_intact(uuid)
  TO soundpub_reconciler,soundpub_auditor;
