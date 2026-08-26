-- =============================================
-- Soundpub RECONCILE USER ROLES FROM CSV
-- Generated from exported-data/user_roles_2026-07-10.csv.
-- This only changes roles for users listed in the CSV.
-- It does not delete auth.users/profiles or any other data.
-- Expected source counts: artist=78, admin=2, copyright=3, user=5, superadmin=2, whitelabel=10, label=4
-- =============================================

BEGIN;

CREATE TEMP TABLE tmp_Soundpub_user_roles_source (
  user_id uuid NOT NULL,
  role Soundpub.app_role NOT NULL,
  created_at timestamptz,
  original_user_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_Soundpub_user_roles_source (user_id, role, created_at, original_user_id)
VALUES
  ('76afbaee-4eb8-49f4-b3e0-da3905818e42'::uuid, 'artist'::Soundpub.app_role, '2026-01-13T03:34:20.024724+00:00'::timestamptz, '849fb82f-1005-4f46-a939-544c6bbd46dc'::uuid),
  ('b9429118-74a3-4c03-be12-50083ed24890'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:32:00.224261+00:00'::timestamptz, '6bde00f2-8131-41e8-80bb-bcf934bbf583'::uuid),
  ('9898c0c6-9cd6-43fb-88b5-bfae29875906'::uuid, 'admin'::Soundpub.app_role, '2026-01-10T11:12:06.177862+00:00'::timestamptz, '77ed6f32-077d-4a53-ad08-fcf8729963c2'::uuid),
  ('85f0fb5f-4335-49be-a00b-4900abc25d89'::uuid, 'artist'::Soundpub.app_role, '2026-01-13T03:35:07.219545+00:00'::timestamptz, '6e1cc605-0d5e-4cb6-9107-bea55ada6d2b'::uuid),
  ('37e238fb-3240-4aa5-bdf0-ded917b523bd'::uuid, 'artist'::Soundpub.app_role, '2026-01-13T03:35:35.019821+00:00'::timestamptz, '9d65dadf-cb69-408c-bf2c-507ec56d1d20'::uuid),
  ('503c38b6-61d3-4548-aeda-6a493e793f49'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:32:14.223259+00:00'::timestamptz, '1e586c91-c7eb-4f1a-9572-7938f45e00dd'::uuid),
  ('b176fb52-fdc0-4d31-b87c-380f54575314'::uuid, 'artist'::Soundpub.app_role, '2026-01-13T03:36:16.565571+00:00'::timestamptz, '0cbd71d7-a9c8-4f2f-807c-7a5f65cd647e'::uuid),
  ('6eae5318-fde1-4dda-b61c-013dc321f4ac'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:32:27.803108+00:00'::timestamptz, 'c0d980e2-d14a-40e5-9b93-14410916a2b6'::uuid),
  ('a119173f-8e6d-48ed-b2b3-483b8514ba7d'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:32:45.259654+00:00'::timestamptz, 'd85ecd8a-1689-4855-b8f9-72927bc4e82b'::uuid),
  ('b48d7118-91f5-4da7-969d-93fbf1b598bd'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:33:09.426529+00:00'::timestamptz, 'b38e43dc-0f02-4155-8637-19f8092e7eb7'::uuid),
  ('9acae5a3-bedd-4d6e-af65-82d040871736'::uuid, 'copyright'::Soundpub.app_role, '2026-01-18T13:54:33.618449+00:00'::timestamptz, 'eaa1a7dd-f9ca-4d02-826b-90aa1048ddef'::uuid),
  ('ff9e0dd6-9a87-4f9c-a31a-65782e86aed5'::uuid, 'copyright'::Soundpub.app_role, '2026-01-18T14:20:03.131509+00:00'::timestamptz, '25128b7d-fc27-4cf7-8125-efb70c470329'::uuid),
  ('228dcf9a-57cc-47cd-a6c3-d011af6d5110'::uuid, 'copyright'::Soundpub.app_role, '2026-01-18T18:02:17.757427+00:00'::timestamptz, '74ab71c9-78b9-46b3-966f-085a3c6c3424'::uuid),
  ('b529cdc5-e6b0-4536-9591-bf8345d95e36'::uuid, 'artist'::Soundpub.app_role, '2026-01-18T18:40:25.459375+00:00'::timestamptz, '0661364d-fb84-40f0-9622-23693b479dd0'::uuid),
  ('17f503f4-3178-4740-8c91-668b2b6a726e'::uuid, 'user'::Soundpub.app_role, '2026-01-23T12:22:47.242302+00:00'::timestamptz, 'dfb62d12-c893-4544-8f37-820aa2caa4d5'::uuid),
  ('9aa9e88e-17d8-41db-ba34-468caa8c009b'::uuid, 'superadmin'::Soundpub.app_role, '2026-02-05T17:53:45.778049+00:00'::timestamptz, 'a78840eb-967b-40c1-b615-82e4a62fe5bd'::uuid),
  ('8825a7dd-7c3a-4878-8f6a-cb9554eaa6cf'::uuid, 'whitelabel'::Soundpub.app_role, '2026-01-26T14:02:05.156819+00:00'::timestamptz, '20df61cb-a8f3-416f-951b-00f4d5fe5dcb'::uuid),
  ('b7db93d3-38d1-4db1-87d4-4a83df65a274'::uuid, 'admin'::Soundpub.app_role, '2026-01-26T13:50:07.637363+00:00'::timestamptz, '2014970b-da4c-44d9-b4d9-0c2aaee8198e'::uuid),
  ('c2add00f-b0e8-4e95-8bb1-ef87e835c683'::uuid, 'whitelabel'::Soundpub.app_role, '2026-02-16T06:02:49.098209+00:00'::timestamptz, 'a30a6da4-236e-41af-93ae-d44698cd8444'::uuid),
  ('6f05837b-1850-495e-b834-2db3158f5d30'::uuid, 'whitelabel'::Soundpub.app_role, '2026-02-16T06:27:46.129392+00:00'::timestamptz, 'daa28b80-fa1f-4540-8aff-a04183f209f5'::uuid),
  ('40c52daa-ab06-4f09-abd7-df6bd8b3a887'::uuid, 'whitelabel'::Soundpub.app_role, '2026-02-16T07:13:23.11801+00:00'::timestamptz, 'b6eea92d-9f48-49ac-8923-045df3ddc4f2'::uuid),
  ('9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid, 'label'::Soundpub.app_role, '2026-01-12T05:55:55.980217+00:00'::timestamptz, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419'::uuid),
  ('e3ecf5a7-f18e-477b-b67e-6f16b3eb2a06'::uuid, 'whitelabel'::Soundpub.app_role, '2026-01-13T04:21:11.547141+00:00'::timestamptz, '85cdc767-ece6-440e-9509-ef4c7df6241f'::uuid),
  ('f3989afb-d4ba-48de-ace9-2bbf31f2c493'::uuid, 'label'::Soundpub.app_role, '2026-01-12T05:56:57.675222+00:00'::timestamptz, '45133775-dd75-4495-ab7d-5fbeb79d85ad'::uuid),
  ('ba947c73-68c2-4a65-b6de-4f6ffec75a67'::uuid, 'artist'::Soundpub.app_role, '2026-02-16T14:26:08.472768+00:00'::timestamptz, 'c872dc69-8b14-432b-81be-749273272fd9'::uuid),
  ('fe9bb4c2-9da8-468d-b80b-cb1cce58081b'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:01:19.997322+00:00'::timestamptz, 'cab4910a-db8d-4a13-bb58-f6f9214c5364'::uuid),
  ('cc52b8c0-8fa1-4f2d-8bef-e9a3689ef31b'::uuid, 'artist'::Soundpub.app_role, '2026-01-31T05:14:17.400145+00:00'::timestamptz, '3e9a8b0f-8724-49c2-9bf1-9b6cdb81846e'::uuid),
  ('116ec08a-85ea-4920-b7bb-1e52b4e04870'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:02:04.439552+00:00'::timestamptz, '28b456a5-36fe-402a-a252-f9d75ad6db52'::uuid),
  ('8c8a6e9a-0d4d-46ab-8c78-b56f2ed1540d'::uuid, 'whitelabel'::Soundpub.app_role, '2026-02-17T12:39:55.491498+00:00'::timestamptz, '9ab9ea3b-c277-4ce3-a7ec-4d91de027aac'::uuid),
  ('ae6ba4ce-4f53-4de1-9c95-e5e7590f6170'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:03:04.4532+00:00'::timestamptz, '1b3c9e2b-99e2-4697-8246-5398c4a5e0ad'::uuid),
  ('27bfac99-f446-4521-bab7-356e6c2e0971'::uuid, 'user'::Soundpub.app_role, '2026-02-20T09:43:34.633702+00:00'::timestamptz, '0f0193ae-08bd-41a0-a809-420708963afb'::uuid),
  ('4026298d-a4ba-4f29-b7fa-7d44432da0cf'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:03:48.30805+00:00'::timestamptz, '05dac016-4430-4b3e-96a2-4960d43b37f1'::uuid),
  ('66e65f06-bed9-428f-84b8-afa039067b4e'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:04:24.781844+00:00'::timestamptz, '314e1208-793b-4ce1-9ba3-9e7e64bdfd68'::uuid),
  ('9af4d0b9-3c0d-4547-80f8-983fa99ad630'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:04:56.536955+00:00'::timestamptz, '88083fa5-3d97-4821-8dd7-ddd7df18010b'::uuid),
  ('1a749d0a-385d-4f04-9f92-12f4ecffc096'::uuid, 'artist'::Soundpub.app_role, '2026-02-24T17:19:34.686991+00:00'::timestamptz, '73e3cc7d-527a-427f-afbb-e8caa15658c4'::uuid),
  ('c262a2d6-e5e7-4858-b501-c642ce8adbbb'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:05:31.659868+00:00'::timestamptz, 'c64e65d5-0241-4d6e-b0c5-796906605dcd'::uuid),
  ('ecffce5e-2ebe-45df-8cfa-5f73a30ccc31'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:06:11.391153+00:00'::timestamptz, 'b2fddc34-b173-4cce-8a8d-55a10e501c9a'::uuid),
  ('db977d19-e3c7-4f24-94b0-f525d4df6d37'::uuid, 'artist'::Soundpub.app_role, '2026-01-12T06:17:08.563876+00:00'::timestamptz, 'b696c72e-9263-4a8f-99aa-1a15b2bb0b80'::uuid),
  ('fa006126-dce8-4114-8c21-3abba21e27ce'::uuid, 'superadmin'::Soundpub.app_role, null, '7d05f477-ef67-449f-a6cf-29097394948f'::uuid),
  ('f602aec6-64d4-4c2a-a8cb-bfe603012e39'::uuid, 'artist'::Soundpub.app_role, '2026-02-01T14:14:23.534705+00:00'::timestamptz, 'f98f7995-3998-48f1-bcd8-9be8f3a8a8fc'::uuid),
  ('0c43a845-7ef8-4cb8-afb1-9068e3813584'::uuid, 'user'::Soundpub.app_role, '2026-03-07T20:19:36.168267+00:00'::timestamptz, '8a54cd4b-34c9-45c6-8fa4-579f661647a4'::uuid),
  ('cdb344e9-2ab7-4fae-acc0-1a30e431b53c'::uuid, 'artist'::Soundpub.app_role, '2026-01-13T03:32:54.713197+00:00'::timestamptz, 'a72fb515-cb71-4d67-9afd-acc6c872ed95'::uuid),
  ('fdd30615-9c21-4625-9bea-fb92a896bda4'::uuid, 'whitelabel'::Soundpub.app_role, '2026-03-09T09:00:58.497737+00:00'::timestamptz, '1a36717f-2d70-4321-9447-53a3685d522f'::uuid),
  ('d38fbf0b-cd72-4782-84b5-eda8f3d57d87'::uuid, 'user'::Soundpub.app_role, '2026-03-13T02:11:56.077976+00:00'::timestamptz, 'ea45f1b1-bd39-4804-bd70-958e066ce975'::uuid),
  ('065c4f39-7bd7-46ac-b741-570c20ac681d'::uuid, 'artist'::Soundpub.app_role, '2026-02-02T20:26:40.610869+00:00'::timestamptz, '1b76b0c1-9857-480a-9574-ade176ad2289'::uuid),
  ('e777b61a-2775-404d-bfcb-46ff57f88177'::uuid, 'artist'::Soundpub.app_role, '2026-03-15T07:00:32.024566+00:00'::timestamptz, '8150efce-a83d-4686-9cfc-3b1060d38469'::uuid),
  ('403d94cd-4e4b-4a0f-baa6-8adbde9b129d'::uuid, 'artist'::Soundpub.app_role, '2026-02-02T20:27:38.349796+00:00'::timestamptz, '3de31c4f-2a40-455f-a079-65faa3b3ad5c'::uuid),
  ('7aaeb922-edef-4e2e-84dc-a2050bab3696'::uuid, 'user'::Soundpub.app_role, '2026-02-03T06:50:02.256228+00:00'::timestamptz, '7dc63e78-9691-46e9-8452-a506b609a45e'::uuid),
  ('2cd040d7-16d9-4e4c-8e31-6990970c7f24'::uuid, 'artist'::Soundpub.app_role, '2026-02-03T10:57:22.939736+00:00'::timestamptz, 'fc095a9a-abfa-4a14-b9ed-c1edad9ce2aa'::uuid),
  ('2ef05d3c-95da-4064-86bd-a20ff9ef821f'::uuid, 'artist'::Soundpub.app_role, '2026-03-04T02:03:29.878739+00:00'::timestamptz, '29a0d49f-e6d9-4ff3-884b-8c77e0beb8c1'::uuid),
  ('14379814-c14b-42fe-936c-ae55092821c9'::uuid, 'artist'::Soundpub.app_role, '2026-04-02T03:15:55.239737+00:00'::timestamptz, '9ba7fa0f-c311-4d82-ba6e-30dd062ad10b'::uuid),
  ('2408459a-d132-42a1-b267-d0b340f5d00f'::uuid, 'label'::Soundpub.app_role, '2026-02-04T07:46:03.309414+00:00'::timestamptz, '0ef8d1e0-c4ee-44e8-89bf-46504d3f559b'::uuid),
  ('67b5ca08-fbfa-4e7d-8b39-84538477f74d'::uuid, 'label'::Soundpub.app_role, '2026-04-07T08:55:16.912759+00:00'::timestamptz, '3938c13d-f8f7-47ff-8e7f-6a3a8535e894'::uuid),
  ('aeb8f735-7062-4b92-ac20-239c0c73b7d5'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:24:28.230126+00:00'::timestamptz, '181d4f91-7467-4f8a-9e84-1290352a0e2f'::uuid),
  ('f55d4e06-1242-453d-9da5-6e1ad835a23b'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:24:42.531146+00:00'::timestamptz, 'bc7b8dc7-f8fc-41fa-8f4d-e95dc37535bb'::uuid),
  ('564e74d9-0839-431b-96d4-f83ad74cb64f'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:25:15.724769+00:00'::timestamptz, 'd379fdce-4e0b-44fb-b8ca-eb5f3ad308d5'::uuid),
  ('b5a64267-8741-44d6-82da-5451f8fad385'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:26:36.882835+00:00'::timestamptz, 'd9561de5-cb45-4421-8396-5bb34203d3b5'::uuid),
  ('30ab7c5f-7f6f-4176-a810-80ee11e6470b'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:26:55.422149+00:00'::timestamptz, 'b5cda168-a964-48ae-a88d-6b6d7e1e6a5e'::uuid),
  ('92a9208d-da20-4cc0-a454-5ffa5ada67d4'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:27:21.974814+00:00'::timestamptz, '40eab829-674a-4a83-8277-9556621287d5'::uuid),
  ('739ba9ce-7440-4358-b3d7-97b2826e58e4'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:28:09.330243+00:00'::timestamptz, 'f76856c9-db32-4870-a8fd-5ef1d7000e5a'::uuid),
  ('ab060990-8878-4446-b490-705353047291'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:28:34.176548+00:00'::timestamptz, '84254859-1dfb-4ed9-b565-3b44073cf186'::uuid),
  ('8386593a-fcc5-4efb-8f9d-3459e294e817'::uuid, 'artist'::Soundpub.app_role, '2026-04-07T16:54:46.309805+00:00'::timestamptz, '4478f260-3589-47e9-a6f1-1221841a5000'::uuid),
  ('046ee55c-fc04-4587-a438-1c3ee2f2efed'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:28:53.355152+00:00'::timestamptz, '5b282970-a486-4c7f-b75b-68e9ddbb58f8'::uuid),
  ('2f3bfe68-8f8c-46cb-a760-90ac26b4aeea'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:29:08.026779+00:00'::timestamptz, '9bc1c1e0-90fe-48af-91e3-aa0c7f1d0881'::uuid),
  ('4852087e-f89c-4843-b450-4872dba0d3cd'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:31:15.256308+00:00'::timestamptz, '8e99f12d-d2c9-4f4d-bc08-95ba7bcf3c91'::uuid),
  ('614b6174-28ac-444d-bb3f-5ef3a0f24d1a'::uuid, 'artist'::Soundpub.app_role, '2026-02-04T08:31:45.348838+00:00'::timestamptz, 'dee9803d-3f3a-419f-9b28-05989227cf29'::uuid),
  ('d35d226f-69a3-416b-bdc3-4091a8fd56a5'::uuid, 'artist'::Soundpub.app_role, '2026-04-07T19:34:07.390415+00:00'::timestamptz, '2a58f3c9-7c77-474a-8f16-520cca7e881e'::uuid),
  ('943a9115-dab9-431f-a586-5c9e472713d6'::uuid, 'artist'::Soundpub.app_role, '2026-04-08T02:33:32.152128+00:00'::timestamptz, 'c4d25798-62bf-4381-b606-d119c9f87aed'::uuid),
  ('9fe94bd1-3be7-49d6-85b4-1f6559401f73'::uuid, 'artist'::Soundpub.app_role, '2026-04-08T08:47:25.297604+00:00'::timestamptz, '675ef149-a4b5-48eb-8ac3-e15c517431f6'::uuid),
  ('dfe91d2c-83f4-4413-be72-0b979e475f91'::uuid, 'artist'::Soundpub.app_role, '2026-04-07T18:12:45.197786+00:00'::timestamptz, 'd9fd69ce-f57d-48cd-b9bc-a993db90a11e'::uuid),
  ('ad138476-9e16-47ac-8742-1e3e88dc3436'::uuid, 'artist'::Soundpub.app_role, '2026-04-08T12:14:50.440923+00:00'::timestamptz, 'd61cacee-5e5a-4339-af29-e2a30dbef319'::uuid),
  ('fb91ab9b-9ba3-49b9-a3fd-3870cf658382'::uuid, 'artist'::Soundpub.app_role, '2026-04-09T04:42:29.903601+00:00'::timestamptz, '3f2c5799-afb0-4329-8509-1fe32abe05c5'::uuid),
  ('83363b19-90e3-4953-bbe1-4f2376acf519'::uuid, 'artist'::Soundpub.app_role, '2026-04-09T04:42:44.406084+00:00'::timestamptz, 'c7f7a240-73d4-4f64-be84-620cab0697b2'::uuid),
  ('df08ff45-5fc9-4556-a7ae-2708c46400c6'::uuid, 'artist'::Soundpub.app_role, '2026-04-10T09:55:27.352255+00:00'::timestamptz, '7a18ff64-9d03-4f85-9e06-f4d93a5d738f'::uuid),
  ('89bd7f47-6293-4385-934c-8b6446995f3d'::uuid, 'artist'::Soundpub.app_role, '2026-04-11T07:23:12.119027+00:00'::timestamptz, 'c4e42511-cdc2-4e00-9ae9-1bea6950204d'::uuid),
  ('f325a7b1-954a-40c2-8396-ab8702145d95'::uuid, 'artist'::Soundpub.app_role, '2026-04-11T10:35:28.445334+00:00'::timestamptz, '87270046-da67-4391-93b9-536cd7cece86'::uuid),
  ('0c29c77c-8ffa-4fa9-b132-7af27199223b'::uuid, 'artist'::Soundpub.app_role, '2026-04-12T15:37:13.04049+00:00'::timestamptz, '60e646d1-834d-46dd-8685-9f62ba5ef43d'::uuid),
  ('2b6fccdf-b2d3-4456-aac7-66c18494e9b9'::uuid, 'whitelabel'::Soundpub.app_role, '2026-04-13T12:53:32.417841+00:00'::timestamptz, 'a9429976-e282-45af-91da-6df4bf7ed4c0'::uuid),
  ('992ca712-3022-4cfb-8379-e7dc25e01816'::uuid, 'whitelabel'::Soundpub.app_role, '2026-04-13T12:54:06.920435+00:00'::timestamptz, '3b94080b-0dec-43d9-8da1-631c3609e537'::uuid),
  ('b0e2b820-d72b-4600-a0f0-9c5b4f95763d'::uuid, 'artist'::Soundpub.app_role, '2026-04-14T07:10:43.834596+00:00'::timestamptz, '000ecba1-3f8c-4caa-acbf-a45369f60d1e'::uuid),
  ('bcadfedf-d52f-44c1-9e7d-4de46e284293'::uuid, 'artist'::Soundpub.app_role, '2026-04-22T01:38:00.116176+00:00'::timestamptz, '8f716605-67dd-4d65-8b43-5b15b3bb1deb'::uuid),
  ('d96e7df1-dce7-4b64-8be5-6ba218dc2120'::uuid, 'artist'::Soundpub.app_role, '2026-05-12T09:42:47.987574+00:00'::timestamptz, 'c0415bd6-06a1-4b96-be34-8027f914588c'::uuid),
  ('442b47f0-29ab-43de-97d8-49007f7d313f'::uuid, 'whitelabel'::Soundpub.app_role, '2026-05-16T12:36:19.717434+00:00'::timestamptz, 'edec1e41-0555-49cb-80f7-2ba19cba541e'::uuid),
  ('97696581-e228-4887-a374-4a2a38e4d78e'::uuid, 'artist'::Soundpub.app_role, '2026-05-22T10:20:44.665462+00:00'::timestamptz, 'd4b77b30-ee85-4089-89fa-4eb7fd898738'::uuid),
  ('d675d7c1-4fee-4c24-9d21-ecd95b2b422c'::uuid, 'artist'::Soundpub.app_role, '2026-05-26T06:50:39.037499+00:00'::timestamptz, '3403b4d9-50b4-4971-b58b-3086991844cb'::uuid),
  ('0a273562-f30f-47ee-99e5-8f3bdb6f0801'::uuid, 'artist'::Soundpub.app_role, '2026-06-09T10:11:11.311285+00:00'::timestamptz, '387647b5-8b46-45ed-80bd-c73bb98da404'::uuid),
  ('63bef093-4d16-4f37-b5e0-68fe29549067'::uuid, 'artist'::Soundpub.app_role, '2026-06-09T10:14:33.782865+00:00'::timestamptz, '13a56d7d-6612-4170-a8a2-b2706ee60096'::uuid),
  ('4b2de69e-058c-4a1a-886e-2a28168c888f'::uuid, 'artist'::Soundpub.app_role, '2026-06-09T17:05:31.774126+00:00'::timestamptz, 'e0430a31-988b-47a1-8a56-3815bc96ffdf'::uuid),
  ('a77d9f5b-496e-4412-b9dc-8fb7d2627fc1'::uuid, 'artist'::Soundpub.app_role, '2026-06-12T10:57:44.950127+00:00'::timestamptz, '36afe424-85c7-42c4-8851-9fc2ca76518d'::uuid),
  ('718e56b8-fa41-4056-9d56-208ce60988e9'::uuid, 'artist'::Soundpub.app_role, '2026-06-19T09:06:02.403074+00:00'::timestamptz, '8aa6ae1f-1d64-47b1-98fb-25df959355f7'::uuid),
  ('0f9619e2-1c8e-4ebe-805b-6a14f32ac382'::uuid, 'artist'::Soundpub.app_role, '2026-06-19T11:25:24.143137+00:00'::timestamptz, 'bb6d7ce6-3085-4afd-83ce-c9649ef27ba8'::uuid),
  ('1bdb2cd2-e3fb-416d-ba6f-fdacdfd22caf'::uuid, 'artist'::Soundpub.app_role, '2026-06-19T12:27:55.835097+00:00'::timestamptz, 'd9939a95-7e81-4a9b-a3b4-0b9b3c12d09e'::uuid),
  ('865ee07c-39dd-417a-9b9c-4bfcf43149aa'::uuid, 'artist'::Soundpub.app_role, '2026-06-19T23:57:43.216234+00:00'::timestamptz, '6660291a-7d48-47a8-bf1a-18df858d3e3a'::uuid),
  ('83123022-0f12-4427-a5b0-e52b4f5d3d74'::uuid, 'artist'::Soundpub.app_role, '2026-06-21T15:53:37.740632+00:00'::timestamptz, '38f6cfa7-a686-4408-b8e4-61ec6686c834'::uuid),
  ('f20ee5db-4cfc-4897-81f0-127081c56bf9'::uuid, 'artist'::Soundpub.app_role, '2026-06-22T06:03:41.919136+00:00'::timestamptz, 'd5e08c7e-6121-474a-bddc-9a9a3f72614e'::uuid),
  ('5ab0f0aa-0064-42a3-9acb-a2d9e1acc76a'::uuid, 'artist'::Soundpub.app_role, '2026-06-22T08:16:09.673051+00:00'::timestamptz, '2ffe41ab-c8e6-4452-ac39-81cb74728a51'::uuid),
  ('238680c8-6177-4849-a91c-03cb32c710dd'::uuid, 'artist'::Soundpub.app_role, '2026-06-22T17:52:57.410873+00:00'::timestamptz, 'c0650eec-0f67-4e67-a696-b4ba1a66ef88'::uuid),
  ('d60e745e-7342-432f-b29d-bffaf6c8b9cf'::uuid, 'artist'::Soundpub.app_role, '2026-06-23T05:50:31.73476+00:00'::timestamptz, '7d295978-6cab-4803-b903-8f66f4598784'::uuid),
  ('25c96a01-1ce7-4ef3-a49b-584dbf1bc36f'::uuid, 'artist'::Soundpub.app_role, '2026-06-23T18:37:19.525744+00:00'::timestamptz, 'a26ca2cc-fca8-47f7-b144-baf96f62928b'::uuid),
  ('80ca9867-6447-475b-a6fd-faf50e59be7b'::uuid, 'artist'::Soundpub.app_role, '2026-06-24T07:42:15.557675+00:00'::timestamptz, 'f5c442de-6674-4e8a-877a-363aa149e3a1'::uuid),
  ('d30e6ada-a44b-49a4-a786-86350be443f5'::uuid, 'artist'::Soundpub.app_role, '2026-06-24T08:07:11.758927+00:00'::timestamptz, 'f413bddd-b962-4c5f-baf6-18135b612843'::uuid),
  ('569eae1f-9a9a-49ec-8574-194bbd471ef6'::uuid, 'artist'::Soundpub.app_role, '2026-06-24T11:45:00.367241+00:00'::timestamptz, 'e3030f65-8f66-446c-b4fe-6968c5284ad0'::uuid),
  ('b9731770-0d3e-44d7-8c49-0a510aa67d4d'::uuid, 'artist'::Soundpub.app_role, '2026-06-24T18:43:09.512841+00:00'::timestamptz, 'ef0d2863-d3f4-4a64-935d-89558b374bee'::uuid),
  ('28d62927-8d50-4993-8496-2ff02a522c84'::uuid, 'artist'::Soundpub.app_role, '2026-06-28T10:15:51.868102+00:00'::timestamptz, '42a06b73-7795-45b2-ad35-bb101d7fcf9a'::uuid);

CREATE TEMP TABLE tmp_Soundpub_user_roles_valid AS
SELECT s.*
FROM tmp_Soundpub_user_roles_source s
JOIN auth.users au ON au.id = s.user_id;

CREATE TEMP TABLE tmp_Soundpub_user_roles_missing_auth AS
SELECT s.*
FROM tmp_Soundpub_user_roles_source s
LEFT JOIN auth.users au ON au.id = s.user_id
WHERE au.id IS NULL;

SELECT
  'SKIPPED_MISSING_AUTH_USER' AS status,
  user_id,
  original_user_id,
  role::text,
  created_at
FROM tmp_Soundpub_user_roles_missing_auth
ORDER BY role::text, user_id;

SELECT
  p.email,
  p.full_name,
  s.user_id,
  array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role IS NOT NULL) AS current_roles,
  array_agg(DISTINCT s.role::text ORDER BY s.role::text) AS csv_roles
FROM tmp_Soundpub_user_roles_valid s
LEFT JOIN Soundpub.user_roles ur ON ur.user_id = s.user_id
LEFT JOIN Soundpub.profiles p ON p.id = s.user_id
GROUP BY p.email, p.full_name, s.user_id
HAVING array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role IS NOT NULL)
   IS DISTINCT FROM array_agg(DISTINCT s.role::text ORDER BY s.role::text)
ORDER BY p.email NULLS LAST, p.full_name NULLS LAST;

DELETE FROM Soundpub.user_roles ur
USING (SELECT DISTINCT user_id FROM tmp_Soundpub_user_roles_valid) s
WHERE ur.user_id = s.user_id;

INSERT INTO Soundpub.user_roles (user_id, role, created_at)
SELECT user_id, role, COALESCE(created_at, now())
FROM tmp_Soundpub_user_roles_valid
ON CONFLICT (user_id, role) DO NOTHING;

SELECT ur.role::text AS role, count(*) AS total
FROM Soundpub.user_roles ur
JOIN (SELECT DISTINCT user_id FROM tmp_Soundpub_user_roles_valid) s ON s.user_id = ur.user_id
GROUP BY ur.role
ORDER BY ur.role::text;

SELECT role::text AS skipped_role, count(*) AS skipped_total
FROM tmp_Soundpub_user_roles_missing_auth
GROUP BY role
ORDER BY role::text;

COMMIT;
