-- Backend computes payment snapshots during aggregate creation.
GRANT INSERT (price_per_track_snapshot, total_payment_snapshot) ON soundpub.releases TO soundpub_app;
