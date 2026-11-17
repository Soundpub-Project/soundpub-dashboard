ALTER TABLE soundpub.artist_profiles
  ADD COLUMN profile_image_media_id uuid REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT;

ALTER TABLE soundpub.artist_profiles
  ADD CONSTRAINT artist_profiles_profile_image_media_url_check
  CHECK (profile_image_media_id IS NULL OR profile_image_url LIKE '/api/v1/storage/objects/%/download');

ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_resource_type_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_resource_type_check
  CHECK (resource_type IN ('user','artist_profile','label','release','track','settings','takedown','copyright_registration','payout'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_check CHECK (category IN
  ('USER_AVATAR','ARTIST_PROFILE_IMAGE','LABEL_LOGO','RELEASE_COVER','TRACK_AUDIO','COPYRIGHT_DOCUMENT',
   'COPYRIGHT_REGISTRATION_DOCUMENT','TAKEDOWN_DOCUMENT','PAYOUT_PROOF','OTHER'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_binding_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='artist_profile' AND category='ARTIST_PROFILE_IMAGE') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category='TRACK_AUDIO') OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid) OR
  (resource_type='takedown' AND category='TAKEDOWN_DOCUMENT' AND takedown_request_id=resource_id) OR
  (resource_type='copyright_registration' AND category='COPYRIGHT_REGISTRATION_DOCUMENT'
    AND copyright_registration_id=resource_id) OR
  (resource_type='payout' AND category='PAYOUT_PROOF')
);
GRANT UPDATE (profile_image_media_id) ON soundpub.artist_profiles TO soundpub_app;
CREATE INDEX media_artist_profile_image_resource_idx ON soundpub.media_objects(resource_id)
  WHERE resource_type='artist_profile' AND category='ARTIST_PROFILE_IMAGE';
