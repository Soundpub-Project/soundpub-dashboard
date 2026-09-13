-- 34-artist-label-transfer-policy.sql
-- Purpose:
--   Documents the safe artist label transfer policy used by transfer-artist-label.
--   No destructive data changes. Historical royalties stay with their original label.

BEGIN;

COMMENT ON COLUMN Soundpub.profiles.parent_label_id IS
  'Current operational parent label for an artist. Changing this does not imply historical royalty ownership transfer.';

COMMENT ON COLUMN Soundpub.royalties.label_user_id IS
  'Historical royalty owner label at upload/calculation time. Do not rewrite on artist parent_label_id changes unless a separate audited financial transfer is approved.';

COMMENT ON COLUMN Soundpub.releases.label_id IS
  'Historical release owner label. Artist parent_label_id changes do not automatically move existing releases.';

COMMENT ON COLUMN Soundpub.tracks.artist_user_id IS
  'Artist profile linked to this track. Label ownership is derived from release.label_id for historical releases.';

COMMIT;
