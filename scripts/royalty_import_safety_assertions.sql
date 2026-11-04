DO $$
DECLARE
  result jsonb;
  failed boolean;
BEGIN
  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(jsonb_build_object(
        'period','2026-09','isrc','IDABC1234567','upc','1234567890123',
        'title','Duplicate','artist','Artist','label_name','Label','platform','Spotify',
        'country','ID','sales_type','streaming','sales_unit',1,'net_revenue',300,
        'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
        'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dup.csv', 'dup.csv', false, 'filename_period', 'safety-duplicate'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('already contains' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Duplicate period was not blocked'; END IF;

  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(jsonb_build_object(
        'period','2026-12','isrc','IDABC1234567','upc','1234567890123',
        'title','Negative','artist','Artist','label_name','Label','platform','Spotify',
        'country','ID','sales_type','streaming','sales_unit',1,'net_revenue',-1,
        'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
        'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'negative.csv', 'negative.csv', false, 'filename_period', 'safety-negative'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('nonnegative values' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Negative royalty was not blocked'; END IF;

  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(
        jsonb_build_object('period','2026-12','isrc','IDABC1234567','upc','1234567890123','title','A','artist','Artist','label_name','Label','platform','Spotify','country','ID','sales_type','streaming','sales_unit',1,'net_revenue',1,'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc','label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        jsonb_build_object('period','2027-01','isrc','IDABC1234567','upc','1234567890123','title','B','artist','Artist','label_name','Label','platform','Spotify','country','ID','sales_type','streaming','sales_unit',1,'net_revenue',1,'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc','label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
      ), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'multi.csv', 'multi.csv', false, 'filename_period', 'safety-multi'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('exactly one royalty period' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Multi-period upload was not blocked'; END IF;

  failed := false;
  BEGIN
    PERFORM soundpub.commit_royalty_upload(
      jsonb_build_array(jsonb_build_object(
        'period','2026-09','isrc','IDABC1234567','upc','1234567890123',
        'title','Wrong replacement','artist','Artist','label_name','Label','platform','Spotify',
        'country','ID','sales_type','streaming','sales_unit',1,'net_revenue',200,
        'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
        'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'wrong.csv', 'wrong.csv', true, 'filename_period', 'safety-wrong-replace'
    );
  EXCEPTION WHEN OTHERS THEN
    failed := position('entirely owned by the same original filename' IN SQLERRM) > 0;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Wrong-filename replacement was not blocked'; END IF;

  result := soundpub.commit_royalty_upload(
    jsonb_build_array(jsonb_build_object(
      'period','2026-09','isrc','IDABC1234567','upc','1234567890123',
      'title','Corrected','artist','Artist','label_name','Label','platform','Spotify',
      'country','ID','sales_type','streaming','sales_unit',200,'net_revenue',200,
      'artist_user_id','cccccccc-cccc-cccc-cccc-cccccccccccc',
      'label_user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'corrected.csv', 'royalty-smoke.csv', true, 'filename_period', 'safety-correct-replace'
  );
  IF (result->>'replacedRows')::integer <> 1 THEN RAISE EXCEPTION 'Exact replacement did not replace one row'; END IF;
  IF (result->>'actualBalanceDelta')::numeric <> 91 THEN RAISE EXCEPTION 'Replacement delta mismatch: %', result; END IF;
  IF jsonb_array_length(result->'balanceUpdates') <> 2 THEN RAISE EXCEPTION 'Expected two affected balances: %', result; END IF;

  INSERT INTO soundpub.profiles(id, full_name, status) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Catalog Label','active'),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff','Transferred Artist','active');
  UPDATE soundpub.profiles SET parent_label_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff';
  INSERT INTO soundpub.user_roles VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','label'),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff','artist');
  INSERT INTO soundpub.releases(id,label_id,artist_user_id) VALUES
    ('11111111-2222-3333-4444-555555555555','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','ffffffff-ffff-ffff-ffff-ffffffffffff');
  INSERT INTO soundpub.tracks(id,isrc,release_id,artist_user_id) VALUES
    ('66666666-7777-8888-9999-000000000000','IDXYZ1234567','11111111-2222-3333-4444-555555555555','ffffffff-ffff-ffff-ffff-ffffffffffff');

  result := soundpub.commit_royalty_upload(
    jsonb_build_array(jsonb_build_object(
      'period','2026-11','isrc','IDXYZ1234567','upc','',
      'title','Catalog Transfer','artist','Transferred Artist','label_name','Catalog Label','platform','Spotify',
      'country','ID','sales_type','streaming','sales_unit',10,'net_revenue',100,
      'artist_user_id','ffffffff-ffff-ffff-ffff-ffffffffffff',
      'label_user_id','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    )), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalog.csv', 'catalog.csv', false, 'filename_period', 'safety-catalog-transfer'
  );
  IF (result->>'insertedCount')::integer <> 1 THEN RAISE EXCEPTION 'Catalog ownership upload failed'; END IF;

  IF has_table_privilege('authenticated','soundpub.royalties','INSERT')
     OR has_table_privilege('authenticated','soundpub.royalties','UPDATE')
     OR has_table_privilege('authenticated','soundpub.royalties','DELETE') THEN
    RAISE EXCEPTION 'Authenticated role still has direct royalty mutation privileges';
  END IF;
  IF has_table_privilege('authenticated','soundpub.royalty_uploads','INSERT')
     OR has_table_privilege('authenticated','soundpub.royalty_uploads','UPDATE')
     OR has_table_privilege('authenticated','soundpub.royalty_uploads','DELETE') THEN
    RAISE EXCEPTION 'Authenticated role still has direct upload mutation privileges';
  END IF;
  IF has_table_privilege('authenticated','soundpub.payout_balance_reservations','INSERT')
     OR has_table_privilege('authenticated','soundpub.payout_balance_reservations','UPDATE')
     OR has_table_privilege('authenticated','soundpub.payout_balance_reservations','DELETE') THEN
    RAISE EXCEPTION 'Authenticated role still has direct payout reservation mutation privileges';
  END IF;
END $$;