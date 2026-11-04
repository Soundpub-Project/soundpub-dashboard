BEGIN;
DO $$
DECLARE
  failed boolean;
  baseline_rows bigint;
BEGIN
  SELECT count(*) INTO baseline_rows FROM soundpub.royalties;

  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(jsonb_build_object(
        'period',' 2026-09 ','isrc','IDABC1234567','platform','Spotify','country','ID',
        'sales_unit',1,'net_revenue',100,
        'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
        'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'spaced.csv', 'spaced.csv',
      false, 'filename_period', 'adversarial-spaced-period'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('already contains' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Whitespace period bypass was not blocked'; END IF;

  UPDATE soundpub.profiles SET status = NULL
  WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(jsonb_build_object(
        'period','2027-02','isrc','IDABC1234567','platform','Spotify','country','ID',
        'sales_unit',1,'net_revenue',100,
        'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
        'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'null-status.csv', 'null-status.csv',
      false, 'filename_period', 'adversarial-null-status'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('inactive' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'NULL recipient status was not blocked'; END IF;

  IF (SELECT count(*) FROM soundpub.royalties) <> baseline_rows THEN
    RAISE EXCEPTION 'Adversarial tests changed royalty rows';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='soundpub' AND c.relname='royalties') THEN
    RAISE EXCEPTION 'Royalties RLS is disabled';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='soundpub' AND c.relname='royalty_uploads') THEN
    RAISE EXCEPTION 'Royalty uploads RLS is disabled';
  END IF;
END $$;
ROLLBACK;
