-- Require both DSP fields used by the legacy Custom Label workflow.
UPDATE soundpub.releases SET custom_record_name=custom_label_name
WHERE distribution_service='custom_label' AND NULLIF(btrim(custom_record_name),'') IS NULL
  AND NULLIF(btrim(custom_label_name),'') IS NOT NULL;

ALTER TABLE soundpub.releases
  ADD CONSTRAINT releases_custom_label_metadata_check
  CHECK (distribution_service <> 'custom_label' OR
    (NULLIF(btrim(custom_label_name),'') IS NOT NULL AND NULLIF(btrim(custom_record_name),'') IS NOT NULL));
