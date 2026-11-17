ALTER TABLE soundpub.releases
  ADD COLUMN pricing_snapshot_mode text CHECK (pricing_snapshot_mode IN ('per_track', 'per_category')),
  ADD COLUMN pricing_snapshot_track_count integer CHECK (pricing_snapshot_track_count >= 0);

WITH counts AS (SELECT r.id, count(t.id)::integer AS track_count
  FROM soundpub.releases r LEFT JOIN soundpub.tracks t ON t.release_id = r.id GROUP BY r.id)
UPDATE soundpub.releases r
SET pricing_snapshot_track_count = counts.track_count,
    pricing_snapshot_mode = CASE
      WHEN counts.track_count > 0 THEN 'per_track'
      ELSE NULL END
FROM counts
WHERE counts.id = r.id AND r.total_payment_snapshot IS NOT NULL AND r.price_per_track_snapshot IS NOT NULL;

ALTER TABLE soundpub.releases
  ADD CONSTRAINT releases_pricing_snapshot_pair_check CHECK (
    (pricing_snapshot_mode IS NULL) = (pricing_snapshot_track_count IS NULL)
  );

GRANT INSERT (pricing_snapshot_mode, pricing_snapshot_track_count) ON soundpub.releases TO soundpub_app;
GRANT UPDATE (pricing_snapshot_mode, pricing_snapshot_track_count) ON soundpub.releases TO soundpub_app;
