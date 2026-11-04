-- Monotonic insert order avoids transaction-timestamp ambiguity between overlapping upload intents.
ALTER TABLE soundpub.media_objects
  ADD COLUMN request_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
