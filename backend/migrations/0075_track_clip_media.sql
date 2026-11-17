ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_check CHECK (category IN
  ('USER_AVATAR','ARTIST_PROFILE_IMAGE','LABEL_LOGO','RELEASE_COVER','TRACK_AUDIO','TRACK_CLIP','COPYRIGHT_DOCUMENT',
   'COPYRIGHT_REGISTRATION_DOCUMENT','TAKEDOWN_DOCUMENT','PAYOUT_PROOF','OTHER'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_binding_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='artist_profile' AND category='ARTIST_PROFILE_IMAGE') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category IN ('TRACK_AUDIO','TRACK_CLIP')) OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid) OR
  (resource_type='takedown' AND category='TAKEDOWN_DOCUMENT' AND takedown_request_id=resource_id) OR
  (resource_type='copyright_registration' AND category='COPYRIGHT_REGISTRATION_DOCUMENT'
    AND copyright_registration_id=resource_id) OR
  (resource_type='payout' AND category='PAYOUT_PROOF')
);
ALTER TABLE soundpub.tracks ADD COLUMN clip_media_id uuid REFERENCES soundpub.media_objects(id);
ALTER TABLE soundpub.tracks ADD CONSTRAINT tracks_clip_media_reference_check
  CHECK (clip_media_id IS NULL OR clip_url LIKE '/api/v1/storage/objects/%/download');
GRANT UPDATE (clip_media_id) ON soundpub.tracks TO soundpub_app;
CREATE INDEX tracks_clip_media_id_idx ON soundpub.tracks(clip_media_id) WHERE clip_media_id IS NOT NULL;
