DO $$
DECLARE
  first_result jsonb;
  replay_result jsonb;
  second_result jsonb;
  reversed_result jsonb;
  saved_payout_id uuid;
  royalty_count integer;
  label_balance numeric;
BEGIN
  first_result := soundpub.commit_royalty_upload(
    jsonb_build_array(jsonb_build_object(
      'period', '2026-09', 'isrc', 'IDABC1234567', 'upc', '1234567890123',
      'title', 'Smoke Track', 'artist', 'Artist', 'label_name', 'Label',
      'platform', 'Spotify', 'country', 'ID', 'sales_type', 'streaming',
      'sales_unit', 100, 'net_revenue', 100,
      'artist_user_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'label_user_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    )),
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'royalty-smoke-1.csv', 'royalty-smoke.csv', false, 'filename_period', 'smoke-key-1'
  );
  IF (first_result->>'insertedCount')::integer <> 1 THEN RAISE EXCEPTION 'First upload failed'; END IF;

  replay_result := soundpub.commit_royalty_upload(
    jsonb_build_array(jsonb_build_object(
      'period', '2026-09', 'isrc', 'IDABC1234567', 'upc', '1234567890123',
      'title', 'Smoke Track', 'artist', 'Artist', 'label_name', 'Label',
      'platform', 'Spotify', 'country', 'ID', 'sales_type', 'streaming',
      'sales_unit', 100, 'net_revenue', 100,
      'artist_user_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'label_user_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    )),
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'royalty-smoke-retry.csv', 'royalty-smoke.csv', false, 'filename_period', 'smoke-key-1'
  );
  IF COALESCE((replay_result->>'idempotentReplay')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Retry was not idempotent'; END IF;
  SELECT COUNT(*) INTO royalty_count FROM soundpub.royalties;
  IF royalty_count <> 1 THEN RAISE EXCEPTION 'Retry duplicated royalties'; END IF;

  PERFORM set_config('app.test_uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  saved_payout_id := soundpub.request_payout(10, 'Bank', '123', 'Label');
  SELECT balance INTO label_balance FROM soundpub.profiles WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF label_balance <> 11 THEN RAISE EXCEPTION 'Payout reservation balance mismatch: %', label_balance; END IF;

  second_result := soundpub.commit_royalty_upload(
    jsonb_build_array(jsonb_build_object(
      'period', '2026-10', 'isrc', 'IDABC1234567', 'upc', '1234567890123',
      'title', 'Smoke Track', 'artist', 'Artist', 'label_name', 'Label',
      'platform', 'Spotify', 'country', 'ID', 'sales_type', 'streaming',
      'sales_unit', 100, 'net_revenue', 100,
      'artist_user_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'label_user_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    )),
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'royalty-smoke-2.csv', 'royalty-smoke-2.csv', false, 'filename_period', 'smoke-key-2'
  );
  SELECT balance INTO label_balance FROM soundpub.profiles WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF label_balance <> 32 THEN RAISE EXCEPTION 'Upload restored reserved payout funds: %', label_balance; END IF;

  reversed_result := soundpub.reverse_royalty_upload(
    (second_result->>'uploadId')::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Smoke reversal'
  );
  IF COALESCE((reversed_result->>'ok')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Reversal failed'; END IF;
  SELECT balance INTO label_balance FROM soundpub.profiles WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF label_balance <> 11 THEN RAISE EXCEPTION 'Reversal balance mismatch: %', label_balance; END IF;

  BEGIN
    PERFORM soundpub.reverse_royalty_upload(
      (first_result->>'uploadId')::uuid,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Must be blocked while payout reservation exists'
    );
    RAISE EXCEPTION 'Unsafe reversal was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Unsafe reversal was accepted' THEN RAISE; END IF;
  END;

  IF NOT EXISTS (SELECT 1 FROM soundpub.payout_balance_reservations WHERE payout_id = saved_payout_id) THEN
    RAISE EXCEPTION 'Payout reservation disappeared';
  END IF;
  SELECT balance INTO label_balance FROM soundpub.profiles WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF label_balance <> 12 THEN RAISE EXCEPTION 'Opening balance adjustment was not preserved: %', label_balance; END IF;
END $$;
