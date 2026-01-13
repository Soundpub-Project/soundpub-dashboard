-- =====================================================
-- SOUNDPUB DATABASE EXPORT
-- Exported from Lovable Cloud: 2026-01-13
-- =====================================================

-- Note: This export does NOT include auth.users data.
-- You will need to recreate users in the target Supabase project.
-- User IDs should match the profiles table for proper foreign key relationships.

-- =====================================================
-- 1. APP_SETTINGS TABLE
-- =====================================================
INSERT INTO public.app_settings (id, key, value, created_at, updated_at) VALUES
('fbe9adaa-9a75-4050-af5b-a748698868d9', 'ga4_enabled', 'true', '2026-01-11 17:46:36.706837+00', '2026-01-11 17:55:02.552701+00'),
('e54415a8-0aa6-4040-beb5-e6b6e1a32fde', 'gcs_enabled', 'true', '2026-01-11 17:46:36.706837+00', '2026-01-11 17:55:15.284629+00'),
('ec2b458e-9464-438b-b8ca-40dbc37b4b4e', 'dashboard_logo', 'https://storage.googleapis.com/klikus-biolink/logos/logo-1768154130772.png', '2026-01-11 17:46:36.706837+00', '2026-01-11 17:55:36.369605+00'),
('9e51304f-cc0c-4ab2-9e51-8a189886796a', 'favicon', 'https://storage.googleapis.com/klikus-biolink/favicons/favicon-1768156552031.png', '2026-01-11 18:35:54.091589+00', '2026-01-11 18:35:53.984+00'),
('2331034f-b61b-40ed-b737-5f839faa8e23', 'dashboard_logo_light', 'https://storage.googleapis.com/klikus-biolink/logos/logo-light-1768157532570.png', '2026-01-11 18:52:14.688645+00', '2026-01-11 18:52:14.57+00'),
('7e43e95d-c3d1-4e9e-b293-4c56a9065383', 'dashboard_logo_dark', 'https://storage.googleapis.com/klikus-biolink/logos/logo-dark-1768157535781.png', '2026-01-11 18:52:17.532117+00', '2026-01-11 18:52:17.412+00')
ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

-- =====================================================
-- 2. PROFILES TABLE
-- Note: Insert these AFTER creating users in auth.users with matching IDs
-- =====================================================
INSERT INTO public.profiles (id, email, full_name, status, balance, address, phone, logo_url, logo_url_light, logo_url_dark, parent_label_id, created_at, updated_at) VALUES
('77ed6f32-077d-4a53-ad08-fcf8729963c2', 'admin@soundpub.com', 'admin', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-10 11:12:06.177862+00', '2026-01-10 11:12:06.177862+00'),
('7d05f477-ef67-449f-a6cf-29097394948f', 'utero.apps@gmail.com', 'Developer Soundpub', 'active', 0.00, '', '', NULL, NULL, NULL, NULL, '2026-01-11 05:17:35.661022+00', '2026-01-13 08:33:18.317423+00'),
('74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', 'publishersoundpub@gmail.com', 'Soundpub Music', 'active', 8920.43, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-12 05:55:55.980217+00', '2026-01-13 05:02:55.889434+00'),
('45133775-dd75-4495-ab7d-5fbeb79d85ad', 'ramusic@gmail.com', 'Randomwalk Music', 'active', 819.91, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-12 05:56:57.675222+00', '2026-01-13 04:59:45.187127+00'),
('43c53ada-9efa-41a6-8722-b8dbf01aee2b', 'asrielip@gmail.com', 'Asriel IP', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 05:59:59.176517+00', '2026-01-12 06:00:00.192212+00'),
('cab4910a-db8d-4a13-bb58-f6f9214c5364', 'dafternoon@gmail.com', 'DAfternoon', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '45133775-dd75-4495-ab7d-5fbeb79d85ad', '2026-01-12 06:01:19.997322+00', '2026-01-12 06:01:20.924179+00'),
('28b456a5-36fe-402a-a252-f9d75ad6db52', 'ganusa@gmail.com', 'Ganusa', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:02:04.439552+00', '2026-01-12 06:02:05.383508+00'),
('1b3c9e2b-99e2-4697-8246-5398c4a5e0ad', 'makton@gmail.com', 'Mak Ton feat. Mbok Jum', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:03:04.4532+00', '2026-01-12 06:03:05.40718+00'),
('05dac016-4430-4b3e-96a2-4960d43b37f1', 'pova@gmail.com', 'Pova', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:03:48.30805+00', '2026-01-12 06:03:49.37568+00'),
('314e1208-793b-4ce1-9ba3-9e7e64bdfd68', 'redvalley@gmail.com', 'Red Valley', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:04:24.781844+00', '2026-01-12 06:04:25.798741+00'),
('88083fa5-3d97-4821-8dd7-ddd7df18010b', 'riamremo@gmail.com', 'Riam Remo', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:04:56.536955+00', '2026-01-12 06:04:57.508046+00'),
('c64e65d5-0241-4d6e-b0c5-796906605dcd', 'sakhaartara@gmail.com', 'Sakha Artara', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:05:31.659868+00', '2026-01-12 06:05:32.59338+00'),
('b2fddc34-b173-4cce-8a8d-55a10e501c9a', 'somedayatheaven@gmail.com', 'Someday At Heaven', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:06:11.391153+00', '2026-01-12 06:06:12.335822+00'),
('b696c72e-9263-4a8f-99aa-1a15b2bb0b80', 'maryjona@gmail.com', 'Mary Jona feat. Aditya Dwica, Ibnu THD', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '2026-01-12 06:17:08.563876+00', '2026-01-12 06:17:09.5155+00'),
('eacb62d9-368a-493f-b7cc-d0b79bdd5cc6', 'nawakewed@gmail.com', 'NAWAKEWED', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-13 02:40:12.170823+00', '2026-01-13 02:40:12.170823+00'),
('a72fb515-cb71-4d67-9afd-acc6c872ed95', 'yuhu@gmail.com', 'Yuhu', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6', '2026-01-13 03:32:54.713197+00', '2026-01-13 03:32:55.602011+00'),
('34cc76f4-7c20-46ef-95ad-6d321c02e0db', 'anotherla@gmail.com', 'Another Label', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-13 03:33:35.598383+00', '2026-01-13 03:33:35.598383+00'),
('849fb82f-1005-4f46-a939-544c6bbd46dc', 'artist1@gmail.com', 'Artist 1', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '34cc76f4-7c20-46ef-95ad-6d321c02e0db', '2026-01-13 03:34:20.024724+00', '2026-01-13 03:34:20.981118+00'),
('6e1cc605-0d5e-4cb6-9107-bea55ada6d2b', 'artist2@gmail.com', 'Artist 2', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '34cc76f4-7c20-46ef-95ad-6d321c02e0db', '2026-01-13 03:35:07.219545+00', '2026-01-13 03:35:08.180093+00'),
('9d65dadf-cb69-408c-bf2c-507ec56d1d20', 'artist3@gmail.com', 'Artist 3', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '34cc76f4-7c20-46ef-95ad-6d321c02e0db', '2026-01-13 03:35:35.019821+00', '2026-01-13 03:35:35.984399+00'),
('0cbd71d7-a9c8-4f2f-807c-7a5f65cd647e', 'artist4@gmail.com', 'Artist 4', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '34cc76f4-7c20-46ef-95ad-6d321c02e0db', '2026-01-13 03:36:16.565571+00', '2026-01-13 03:36:17.550892+00'),
('85cdc767-ece6-440e-9509-ef4c7df6241f', 'newlabel@gmail.com', 'New Label', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-13 04:21:11.547141+00', '2026-01-13 04:21:11.547141+00'),
('5b3ed488-4216-48b8-ad3e-afd351a7bdd7', 'newartist@gmail.com', 'New Artist', 'active', 0.00, NULL, NULL, NULL, NULL, NULL, '85cdc767-ece6-440e-9509-ef4c7df6241f', '2026-01-13 04:22:32.116279+00', '2026-01-13 04:22:33.063587+00')
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status,
  balance = EXCLUDED.balance,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  logo_url = EXCLUDED.logo_url,
  logo_url_light = EXCLUDED.logo_url_light,
  logo_url_dark = EXCLUDED.logo_url_dark,
  parent_label_id = EXCLUDED.parent_label_id,
  updated_at = EXCLUDED.updated_at;

-- =====================================================
-- 3. USER_ROLES TABLE
-- =====================================================
INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES
('a7408c6c-901d-45d7-9803-9b43443d2cf0', '77ed6f32-077d-4a53-ad08-fcf8729963c2', 'admin', '2026-01-10 11:12:06.177862+00'),
('00a77f66-0476-4021-800e-16b30a21c535', '7d05f477-ef67-449f-a6cf-29097394948f', 'superadmin', NULL),
('55fb4409-21ac-400b-9ff4-36cbe004e93c', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', 'label', '2026-01-12 05:55:55.980217+00'),
('ab12f7a6-86df-4dbc-9b93-b7882063aaa6', '45133775-dd75-4495-ab7d-5fbeb79d85ad', 'label', '2026-01-12 05:56:57.675222+00'),
('922feb18-24ef-4a5c-8251-3b75d63abeea', '43c53ada-9efa-41a6-8722-b8dbf01aee2b', 'artist', '2026-01-12 05:59:59.176517+00'),
('7a86d9ab-1738-4baa-9a70-eac2994a88be', 'cab4910a-db8d-4a13-bb58-f6f9214c5364', 'artist', '2026-01-12 06:01:19.997322+00'),
('7bd1e7f7-3606-4315-9817-a8d0e6fd5888', '28b456a5-36fe-402a-a252-f9d75ad6db52', 'artist', '2026-01-12 06:02:04.439552+00'),
('dabbdc03-adbb-40bb-9ca3-2ecac794c499', '1b3c9e2b-99e2-4697-8246-5398c4a5e0ad', 'artist', '2026-01-12 06:03:04.4532+00'),
('a453e643-eb0c-4da8-bdba-df80f0a937b0', '05dac016-4430-4b3e-96a2-4960d43b37f1', 'artist', '2026-01-12 06:03:48.30805+00'),
('a5a5d917-d4d2-482d-bc29-aa9ecb13f380', '314e1208-793b-4ce1-9ba3-9e7e64bdfd68', 'artist', '2026-01-12 06:04:24.781844+00'),
('1a4dac5e-30ca-40fc-9d0b-0c47b4c6f2fe', '88083fa5-3d97-4821-8dd7-ddd7df18010b', 'artist', '2026-01-12 06:04:56.536955+00'),
('9dd56927-2d62-4df6-ba23-f39f2b492450', 'c64e65d5-0241-4d6e-b0c5-796906605dcd', 'artist', '2026-01-12 06:05:31.659868+00'),
('f5a27141-a776-4361-934b-7d94c9909c58', 'b2fddc34-b173-4cce-8a8d-55a10e501c9a', 'artist', '2026-01-12 06:06:11.391153+00'),
('13c7c4b3-84d2-48f6-8997-e6b307faf889', 'b696c72e-9263-4a8f-99aa-1a15b2bb0b80', 'artist', '2026-01-12 06:17:08.563876+00'),
('311f1cd2-3834-4c87-8d10-63ec70c6e570', 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6', 'label', '2026-01-13 02:40:12.170823+00'),
('dc73acb5-1a57-4367-8843-28e8836b7fcd', 'a72fb515-cb71-4d67-9afd-acc6c872ed95', 'artist', '2026-01-13 03:32:54.713197+00'),
('45d3068d-3129-4e50-88ab-39b7db79eb8a', '34cc76f4-7c20-46ef-95ad-6d321c02e0db', 'label', '2026-01-13 03:33:35.598383+00'),
('97ae04fa-b83e-4237-b39e-23df699a7697', '849fb82f-1005-4f46-a939-544c6bbd46dc', 'artist', '2026-01-13 03:34:20.024724+00'),
('c2a057dc-4230-4a03-ad7c-90fb1fa786d1', '6e1cc605-0d5e-4cb6-9107-bea55ada6d2b', 'artist', '2026-01-13 03:35:07.219545+00'),
('d5d4be9e-6c58-4414-aac1-e2ba07b54025', '9d65dadf-cb69-408c-bf2c-507ec56d1d20', 'artist', '2026-01-13 03:35:35.019821+00'),
('7a229136-6741-4527-b326-5cccd1fabf66', '0cbd71d7-a9c8-4f2f-807c-7a5f65cd647e', 'artist', '2026-01-13 03:36:16.565571+00'),
('3d586a7c-0858-4575-8d56-34f6b2861bb8', '85cdc767-ece6-440e-9509-ef4c7df6241f', 'label', '2026-01-13 04:21:11.547141+00'),
('a23171fb-ea87-45b0-9f9c-05af1fc497e0', '5b3ed488-4216-48b8-ad3e-afd351a7bdd7', 'artist', '2026-01-13 04:22:32.116279+00')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

-- =====================================================
-- 4. RELEASES TABLE
-- =====================================================
INSERT INTO public.releases (id, title, artist_name, label_id, upc, release_date, cover_url, genre, release_type, status, archived_at, created_by, created_at, updated_at) VALUES
('95a5b209-af27-4106-996e-82fab339f0d9', 'Abot', 'Asriel IP', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137012118', '2025-11-17', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/c5102733-4502-4720-941c-aa8554842865.jpg', 'Dangdut', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:09:40.761887+00', '2026-01-12 09:38:46.14184+00'),
('99cdc2f2-552c-48c0-90ec-3049544476af', 'Gwenchana', 'DAfternoon', '45133775-dd75-4495-ab7d-5fbeb79d85ad', '8990137009644', '2025-10-23', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/c8f8c90f-8da3-4558-8dd9-76ee049d0762.jpg', 'Pop', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:10:54.421801+00', '2026-01-12 09:35:44.312527+00'),
('7875388a-b55a-4f50-ac65-8c6f3bdce7ee', 'Sayap Nusantaraya', 'Ganusa', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137009842', '2025-10-23', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/30116439-c444-45d4-ba7c-09862317dab6.jpg', 'Pop', 'album', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:13:19.583396+00', '2026-01-12 09:31:29.060312+00'),
('ae685622-6a5e-4d8a-bf0d-005bbb9d4f00', 'Cem Ceman (Modal Tampang)', 'Mak Ton feat. Mbok Jum', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137012132', '2025-11-16', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/45b03259-b121-4fdd-8193-2eaa2fdd3a82.jpg', 'Dangdut', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:16:15.386079+00', '2026-01-12 09:22:09.091793+00'),
('a97937dc-c143-46ea-bdfa-392aea7de414', 'Red Flag', 'Mary Jona feat. Aditya Dwica, Ibnu THD', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137003871', '2025-09-04', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/97e2f552-ecc7-44cb-85a1-542538b2162d.jpg', 'Rock', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:18:49.797351+00', '2026-01-12 09:14:27.162902+00'),
('7f48832a-86b6-482c-9ec4-c839ec49c650', 'Siksa', 'Pova', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137009286', '2025-10-21', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/0ff071d6-160f-4b66-aa4c-e4ae4194f5a6.jpg', 'Rock', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:20:17.587251+00', '2026-01-12 09:07:09.893359+00'),
('6d8c535e-f43a-4a41-9c29-ffda5609d0b0', 'M', 'Red Valley', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137012828', '2025-10-18', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/4f727b78-1ac0-405b-8b3f-ac18288d0722.jpg', 'Rock', 'album', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:21:37.49764+00', '2026-01-12 09:00:45.469144+00'),
('c40470b4-6fb2-40a9-b002-c2890a47db96', 'RIAM REMO', 'Riam Remo', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137011753', '2025-10-24', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/125c2ba9-b61c-4790-8975-4e355b0d6318.jpg', 'Pop', 'album', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 06:34:02.610255+00', '2026-01-12 08:51:29.940915+00'),
('e813cede-8294-473e-b238-589f9a0c3b26', 'Dengarlah Ungkapanku', 'Pova', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '8990137014181', '2025-10-18', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/673db55b-376a-48c9-b616-2d50c45faf0f.jpg', 'Rock', 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 09:11:23.108198+00', '2026-01-12 09:11:38.487138+00'),
('39215e8f-4ab9-46c9-9365-a8e8b86a4141', 'Singgah', 'Banyus Ismail', '45133775-dd75-4495-ab7d-5fbeb79d85ad', '8990137014341', '2025-10-18', 'https://opkvvdgnhhopkkeaokzo.supabase.co/storage/v1/object/public/release-covers/covers/3b451978-f0ae-460b-a22a-610d8bacaa40.jpg', NULL, 'single', 'active', NULL, '7d05f477-ef67-449f-a6cf-29097394948f', '2026-01-12 09:42:00.113689+00', '2026-01-12 09:42:00.113689+00')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  artist_name = EXCLUDED.artist_name,
  label_id = EXCLUDED.label_id,
  upc = EXCLUDED.upc,
  release_date = EXCLUDED.release_date,
  cover_url = EXCLUDED.cover_url,
  genre = EXCLUDED.genre,
  release_type = EXCLUDED.release_type,
  status = EXCLUDED.status,
  archived_at = EXCLUDED.archived_at,
  created_by = EXCLUDED.created_by,
  updated_at = EXCLUDED.updated_at;

-- =====================================================
-- 5. ROYALTY_UPLOADS TABLE
-- =====================================================
INSERT INTO public.royalty_uploads (id, user_id, filename, original_filename, status, total_records, inserted_records, summary, error_message, created_at, updated_at) VALUES
('503fb0f2-48ec-48d9-943b-90adcb6ffdfc', '7d05f477-ef67-449f-a6cf-29097394948f', 'royalty_1768280038504.csv', 'Laporan Pendapatan Bulan November 2025.csv', 'success', 454, 454, '{"balanceUpdates":[{"amount":7262.612000000006,"label":"Soundpub Music","success":true},{"amount":807.072,"label":"Randomwalk Music","success":true}],"errors":0,"inserted":454,"total":454}', NULL, '2026-01-13 04:54:03.654724+00', '2026-01-13 04:54:06.101915+00'),
('c5c1de7d-620f-40f2-b98b-f64f5c32d311', '7d05f477-ef67-449f-a6cf-29097394948f', 'royalty_1768280382368.csv', 'Laporan Pendapatan Bulan Oktober 2025.csv', 'success', 44, 44, '{"balanceUpdates":[{"amount":1463.6160000000002,"label":"Soundpub Music","success":true},{"amount":12.838000000000001,"label":"Randomwalk Music","success":true}],"errors":0,"inserted":44,"total":44}', NULL, '2026-01-13 04:59:44.077671+00', '2026-01-13 04:59:45.410777+00'),
('522dab7e-9a20-4686-a02d-e5545bd2ffc4', '7d05f477-ef67-449f-a6cf-29097394948f', 'royalty_1768280573460.csv', 'Laporan Pendapatan Bulan September 2025.csv', 'success', 24, 24, '{"balanceUpdates":[{"amount":194.20100000000002,"label":"Soundpub Music","success":true}],"errors":0,"inserted":24,"total":24}', NULL, '2026-01-13 05:02:54.882399+00', '2026-01-13 05:02:56.201813+00')
ON CONFLICT (id) DO UPDATE SET
  filename = EXCLUDED.filename,
  original_filename = EXCLUDED.original_filename,
  status = EXCLUDED.status,
  total_records = EXCLUDED.total_records,
  inserted_records = EXCLUDED.inserted_records,
  summary = EXCLUDED.summary,
  error_message = EXCLUDED.error_message,
  updated_at = EXCLUDED.updated_at;

-- =====================================================
-- 6. AUDIT_LOGS TABLE
-- =====================================================
INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, details, ip_address, created_at) VALUES
('87b4cf7b-b7f9-48ee-a970-9f040028137f', '7d05f477-ef67-449f-a6cf-29097394948f', 'password_change', 'user', '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419', '{"actor_email":"utero.apps@gmail.com","actor_name":"utero.apps","actor_role":"superadmin","target_email":"publishersoundpub@gmail.com","target_name":"Soundpub Music"}', NULL, '2026-01-13 03:44:27.288415+00'),
('c6c5b0fe-6119-4b24-889e-12d92039a7aa', '7d05f477-ef67-449f-a6cf-29097394948f', 'password_change', 'user', '28b456a5-36fe-402a-a252-f9d75ad6db52', '{"actor_email":"utero.apps@gmail.com","actor_name":"utero.apps","actor_role":"superadmin","target_email":"ganusa@gmail.com","target_name":"Ganusa"}', NULL, '2026-01-13 05:25:57.349546+00')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- NOTE: TRACKS and ROYALTIES data are too large for this file.
-- Please run the separate export queries below in SQL editor.
-- =====================================================

-- To export TRACKS (43 rows):
-- SELECT * FROM tracks ORDER BY created_at;

-- To export ROYALTIES (522 rows):  
-- SELECT * FROM royalties ORDER BY created_at;
