CREATE INDEX copyright_registrations_review_page_idx
  ON soundpub.copyright_registrations (updated_at DESC, id DESC);
