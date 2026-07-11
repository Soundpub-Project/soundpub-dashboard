-- =============================================
-- SOUNDPUB RECONCILE USER ROLES FROM CSV
-- Generated from exported-data/user_roles_2026-07-10.csv.
-- This only changes roles for users listed in the CSV.
-- It does not delete auth.users/profiles or any other data.
-- Expected source counts: artist=78, admin=2, copyright=3, user=5, superadmin=2, whitelabel=10, label=4
-- =============================================

BEGIN;

CREATE TEMP TABLE tmp_soundpub_user_roles_source (
  user_id uuid NOT NULL,
  role soundpub.app_role NOT NULL,
  created_at timestamptz,
  original_user_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_soundpub_user_roles_source (user_id, role, created_at, original_user_id)
VALUES
  ('96b8403f-a8c7-4acd-a591-76556de937b8'::uuid, 'artist'::soundpub.app_role, '2026-01-13T03:34:20.024724+00:00'::timestamptz, '849fb82f-1005-4f46-a939-544c6bbd46dc'::uuid),
  ('b2a99e62-6941-47ed-921a-0919114d27c9'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:32:00.224261+00:00'::timestamptz, '6bde00f2-8131-41e8-80bb-bcf934bbf583'::uuid),
  ('56c39b43-fd53-4fd2-a85c-4e1c38080ac7'::uuid, 'admin'::soundpub.app_role, '2026-01-10T11:12:06.177862+00:00'::timestamptz, '77ed6f32-077d-4a53-ad08-fcf8729963c2'::uuid),
  ('5f1136de-8a86-4e15-8e6d-7647786f6c1b'::uuid, 'artist'::soundpub.app_role, '2026-01-13T03:35:07.219545+00:00'::timestamptz, '6e1cc605-0d5e-4cb6-9107-bea55ada6d2b'::uuid),
  ('d8dcb38c-e5bc-4069-b8c9-7d26087a6f92'::uuid, 'artist'::soundpub.app_role, '2026-01-13T03:35:35.019821+00:00'::timestamptz, '9d65dadf-cb69-408c-bf2c-507ec56d1d20'::uuid),
  ('bf295c79-526a-49d2-a024-47e480f9691e'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:32:14.223259+00:00'::timestamptz, '1e586c91-c7eb-4f1a-9572-7938f45e00dd'::uuid),
  ('c135f213-d795-4ef0-baee-d9216b3630b8'::uuid, 'artist'::soundpub.app_role, '2026-01-13T03:36:16.565571+00:00'::timestamptz, '0cbd71d7-a9c8-4f2f-807c-7a5f65cd647e'::uuid),
  ('ba177d5c-14a6-4b35-a2f6-66f71f690af5'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:32:27.803108+00:00'::timestamptz, 'c0d980e2-d14a-40e5-9b93-14410916a2b6'::uuid),
  ('0a1fe9bf-7228-4c3b-933f-284a88daa2c2'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:32:45.259654+00:00'::timestamptz, 'd85ecd8a-1689-4855-b8f9-72927bc4e82b'::uuid),
  ('a3fb0b82-2f81-46af-b42b-9c31b07d4188'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:33:09.426529+00:00'::timestamptz, 'b38e43dc-0f02-4155-8637-19f8092e7eb7'::uuid),
  ('f177ee37-12ff-4a9b-a2c9-46e973f9b469'::uuid, 'copyright'::soundpub.app_role, '2026-01-18T13:54:33.618449+00:00'::timestamptz, 'eaa1a7dd-f9ca-4d02-826b-90aa1048ddef'::uuid),
  ('2f0516a2-85ec-493b-92bd-9574674d1b05'::uuid, 'copyright'::soundpub.app_role, '2026-01-18T14:20:03.131509+00:00'::timestamptz, '25128b7d-fc27-4cf7-8125-efb70c470329'::uuid),
  ('b9f24ca0-aebd-4415-8ab9-63e62c212183'::uuid, 'copyright'::soundpub.app_role, '2026-01-18T18:02:17.757427+00:00'::timestamptz, '74ab71c9-78b9-46b3-966f-085a3c6c3424'::uuid),
  ('e7857b4f-a8cc-4682-8d88-5cea9babebf9'::uuid, 'artist'::soundpub.app_role, '2026-01-18T18:40:25.459375+00:00'::timestamptz, '0661364d-fb84-40f0-9622-23693b479dd0'::uuid),
  ('eb253545-7709-420c-8fae-c6dbefe044df'::uuid, 'user'::soundpub.app_role, '2026-01-23T12:22:47.242302+00:00'::timestamptz, 'dfb62d12-c893-4544-8f37-820aa2caa4d5'::uuid),
  ('5c15facb-4bcc-4aae-bf87-ff43e2366788'::uuid, 'superadmin'::soundpub.app_role, '2026-02-05T17:53:45.778049+00:00'::timestamptz, 'a78840eb-967b-40c1-b615-82e4a62fe5bd'::uuid),
  ('c426fce8-5121-467f-8624-56c83267f53d'::uuid, 'whitelabel'::soundpub.app_role, '2026-01-26T14:02:05.156819+00:00'::timestamptz, '20df61cb-a8f3-416f-951b-00f4d5fe5dcb'::uuid),
  ('169ac44f-777c-4a99-92cb-046fba2e027d'::uuid, 'admin'::soundpub.app_role, '2026-01-26T13:50:07.637363+00:00'::timestamptz, '2014970b-da4c-44d9-b4d9-0c2aaee8198e'::uuid),
  ('00193104-c65f-4d06-8367-ed7fec662ddf'::uuid, 'whitelabel'::soundpub.app_role, '2026-02-16T06:02:49.098209+00:00'::timestamptz, 'a30a6da4-236e-41af-93ae-d44698cd8444'::uuid),
  ('ecbc3b9e-c707-4d55-90dc-2ec2391b3dc1'::uuid, 'whitelabel'::soundpub.app_role, '2026-02-16T06:27:46.129392+00:00'::timestamptz, 'daa28b80-fa1f-4540-8aff-a04183f209f5'::uuid),
  ('22255100-97f1-4a9e-af6a-840aab18cf8d'::uuid, 'whitelabel'::soundpub.app_role, '2026-02-16T07:13:23.11801+00:00'::timestamptz, 'b6eea92d-9f48-49ac-8923-045df3ddc4f2'::uuid),
  ('423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid, 'label'::soundpub.app_role, '2026-01-12T05:55:55.980217+00:00'::timestamptz, '74c1b87a-2c9b-45c8-a9af-5cdb3d88f419'::uuid),
  ('a7e13b02-71c1-48e9-8f30-4637bd987019'::uuid, 'whitelabel'::soundpub.app_role, '2026-01-13T04:21:11.547141+00:00'::timestamptz, '85cdc767-ece6-440e-9509-ef4c7df6241f'::uuid),
  ('9f84e63f-ad7a-4a1b-afdd-ecc37a8a557e'::uuid, 'label'::soundpub.app_role, '2026-01-12T05:56:57.675222+00:00'::timestamptz, '45133775-dd75-4495-ab7d-5fbeb79d85ad'::uuid),
  ('30412e6f-df97-4155-8aa4-e5612b806c1c'::uuid, 'artist'::soundpub.app_role, '2026-02-16T14:26:08.472768+00:00'::timestamptz, 'c872dc69-8b14-432b-81be-749273272fd9'::uuid),
  ('e98a4d17-3390-4e26-a538-7e180dff389c'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:01:19.997322+00:00'::timestamptz, 'cab4910a-db8d-4a13-bb58-f6f9214c5364'::uuid),
  ('07dbf523-f2c4-43b2-a841-0ac2bcc4a783'::uuid, 'artist'::soundpub.app_role, '2026-01-31T05:14:17.400145+00:00'::timestamptz, '3e9a8b0f-8724-49c2-9bf1-9b6cdb81846e'::uuid),
  ('231c3013-d259-440b-8245-8ebaa26b387b'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:02:04.439552+00:00'::timestamptz, '28b456a5-36fe-402a-a252-f9d75ad6db52'::uuid),
  ('f5e90a38-bb93-4a09-91b4-f61d8c2e1fc7'::uuid, 'whitelabel'::soundpub.app_role, '2026-02-17T12:39:55.491498+00:00'::timestamptz, '9ab9ea3b-c277-4ce3-a7ec-4d91de027aac'::uuid),
  ('0850f158-019e-4693-9eac-117d7ba3a476'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:03:04.4532+00:00'::timestamptz, '1b3c9e2b-99e2-4697-8246-5398c4a5e0ad'::uuid),
  ('42957fc7-c607-4a3b-8dce-bcf1f3844260'::uuid, 'user'::soundpub.app_role, '2026-02-20T09:43:34.633702+00:00'::timestamptz, '0f0193ae-08bd-41a0-a809-420708963afb'::uuid),
  ('0eeff871-ef6a-464d-8113-736e5904ccca'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:03:48.30805+00:00'::timestamptz, '05dac016-4430-4b3e-96a2-4960d43b37f1'::uuid),
  ('c07d4332-58ae-4b8e-bfa1-7cc2f403b6bf'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:04:24.781844+00:00'::timestamptz, '314e1208-793b-4ce1-9ba3-9e7e64bdfd68'::uuid),
  ('5e0afd0b-579e-4418-9421-15446751ea07'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:04:56.536955+00:00'::timestamptz, '88083fa5-3d97-4821-8dd7-ddd7df18010b'::uuid),
  ('e6ac6029-7df3-42b8-9f5e-ae1a34a11775'::uuid, 'artist'::soundpub.app_role, '2026-02-24T17:19:34.686991+00:00'::timestamptz, '73e3cc7d-527a-427f-afbb-e8caa15658c4'::uuid),
  ('86ca2cdc-b69d-4f04-a608-2201b71f2b35'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:05:31.659868+00:00'::timestamptz, 'c64e65d5-0241-4d6e-b0c5-796906605dcd'::uuid),
  ('86d7d4cc-6fab-46d6-9724-5e8c6803d713'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:06:11.391153+00:00'::timestamptz, 'b2fddc34-b173-4cce-8a8d-55a10e501c9a'::uuid),
  ('a74e881d-7c73-42c6-8072-6bf7ba2f1cbe'::uuid, 'artist'::soundpub.app_role, '2026-01-12T06:17:08.563876+00:00'::timestamptz, 'b696c72e-9263-4a8f-99aa-1a15b2bb0b80'::uuid),
  ('169e8e1f-b0aa-4d7c-a656-2abef7e10259'::uuid, 'superadmin'::soundpub.app_role, '2026-07-11T10:26:29.389Z'::timestamptz, '7d05f477-ef67-449f-a6cf-29097394948f'::uuid),
  ('3d6dea26-7ce5-4c69-90d9-c5cb82b08e46'::uuid, 'artist'::soundpub.app_role, '2026-02-01T14:14:23.534705+00:00'::timestamptz, 'f98f7995-3998-48f1-bcd8-9be8f3a8a8fc'::uuid),
  ('7e7c27a6-4f61-425c-ba77-533f3e521b70'::uuid, 'user'::soundpub.app_role, '2026-03-07T20:19:36.168267+00:00'::timestamptz, '8a54cd4b-34c9-45c6-8fa4-579f661647a4'::uuid),
  ('046f01a4-79a1-45e2-9fe4-16c287be1b6a'::uuid, 'artist'::soundpub.app_role, '2026-01-13T03:32:54.713197+00:00'::timestamptz, 'a72fb515-cb71-4d67-9afd-acc6c872ed95'::uuid),
  ('e78b08b1-af8d-4850-bfac-cca8ddfdc3b1'::uuid, 'whitelabel'::soundpub.app_role, '2026-03-09T09:00:58.497737+00:00'::timestamptz, '1a36717f-2d70-4321-9447-53a3685d522f'::uuid),
  ('0e48c36d-7806-4f3c-99a1-039a88b3c4ee'::uuid, 'user'::soundpub.app_role, '2026-03-13T02:11:56.077976+00:00'::timestamptz, 'ea45f1b1-bd39-4804-bd70-958e066ce975'::uuid),
  ('7b354c0d-095e-4207-b102-41fab8e07fec'::uuid, 'artist'::soundpub.app_role, '2026-02-02T20:26:40.610869+00:00'::timestamptz, '1b76b0c1-9857-480a-9574-ade176ad2289'::uuid),
  ('a8e0c0f8-d343-4612-b9d1-5b1ca42f2f95'::uuid, 'artist'::soundpub.app_role, '2026-03-15T07:00:32.024566+00:00'::timestamptz, '8150efce-a83d-4686-9cfc-3b1060d38469'::uuid),
  ('6e34cf6b-b919-4ef0-9ae8-357c9e3664da'::uuid, 'artist'::soundpub.app_role, '2026-02-02T20:27:38.349796+00:00'::timestamptz, '3de31c4f-2a40-455f-a079-65faa3b3ad5c'::uuid),
  ('3b2ec65f-c1f2-4180-b080-15b5078e30aa'::uuid, 'user'::soundpub.app_role, '2026-02-03T06:50:02.256228+00:00'::timestamptz, '7dc63e78-9691-46e9-8452-a506b609a45e'::uuid),
  ('f04e9cd9-bd87-4b12-8462-9927881bd305'::uuid, 'artist'::soundpub.app_role, '2026-02-03T10:57:22.939736+00:00'::timestamptz, 'fc095a9a-abfa-4a14-b9ed-c1edad9ce2aa'::uuid),
  ('e316c7b2-2887-4be8-a71a-cf89f5efd7dd'::uuid, 'artist'::soundpub.app_role, '2026-03-04T02:03:29.878739+00:00'::timestamptz, '29a0d49f-e6d9-4ff3-884b-8c77e0beb8c1'::uuid),
  ('72798fe4-99c0-4210-93e9-2a36979d4c2a'::uuid, 'artist'::soundpub.app_role, '2026-04-02T03:15:55.239737+00:00'::timestamptz, '9ba7fa0f-c311-4d82-ba6e-30dd062ad10b'::uuid),
  ('68192c04-fcfb-4073-a862-d2a2533d2014'::uuid, 'label'::soundpub.app_role, '2026-02-04T07:46:03.309414+00:00'::timestamptz, '0ef8d1e0-c4ee-44e8-89bf-46504d3f559b'::uuid),
  ('6aee3fda-812c-42b8-aebf-3cd708b2ed45'::uuid, 'label'::soundpub.app_role, '2026-04-07T08:55:16.912759+00:00'::timestamptz, '3938c13d-f8f7-47ff-8e7f-6a3a8535e894'::uuid),
  ('dcf1d410-5fba-4a25-a094-a3c5989b5c6e'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:24:28.230126+00:00'::timestamptz, '181d4f91-7467-4f8a-9e84-1290352a0e2f'::uuid),
  ('5f84543c-b5d6-4920-8ed4-6f631fd4884d'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:24:42.531146+00:00'::timestamptz, 'bc7b8dc7-f8fc-41fa-8f4d-e95dc37535bb'::uuid),
  ('30d8eaeb-4815-41ad-9cb6-61a4b0f88b4c'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:25:15.724769+00:00'::timestamptz, 'd379fdce-4e0b-44fb-b8ca-eb5f3ad308d5'::uuid),
  ('4d3f5a1a-fc52-4583-af76-c86a5fc9a8df'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:26:36.882835+00:00'::timestamptz, 'd9561de5-cb45-4421-8396-5bb34203d3b5'::uuid),
  ('df068580-aca2-4d8b-9820-3bc4aab65948'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:26:55.422149+00:00'::timestamptz, 'b5cda168-a964-48ae-a88d-6b6d7e1e6a5e'::uuid),
  ('2790d6e5-e207-4dea-8142-e1202de60247'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:27:21.974814+00:00'::timestamptz, '40eab829-674a-4a83-8277-9556621287d5'::uuid),
  ('35e5c8c9-8b50-429d-b89f-e188d038e827'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:28:09.330243+00:00'::timestamptz, 'f76856c9-db32-4870-a8fd-5ef1d7000e5a'::uuid),
  ('40bafaab-dda0-4d7f-8acb-21f6af30dec8'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:28:34.176548+00:00'::timestamptz, '84254859-1dfb-4ed9-b565-3b44073cf186'::uuid),
  ('09971ecb-d886-47cb-9843-9cfcfc59f020'::uuid, 'artist'::soundpub.app_role, '2026-04-07T16:54:46.309805+00:00'::timestamptz, '4478f260-3589-47e9-a6f1-1221841a5000'::uuid),
  ('50bcca07-174a-4b6d-bc80-2dbaa0411a5d'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:28:53.355152+00:00'::timestamptz, '5b282970-a486-4c7f-b75b-68e9ddbb58f8'::uuid),
  ('f5d0dbc6-370b-4372-aa13-ac56a4d68172'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:29:08.026779+00:00'::timestamptz, '9bc1c1e0-90fe-48af-91e3-aa0c7f1d0881'::uuid),
  ('22b24862-f941-4e7f-b2cc-bcb7e8601ca2'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:31:15.256308+00:00'::timestamptz, '8e99f12d-d2c9-4f4d-bc08-95ba7bcf3c91'::uuid),
  ('c61985d4-6d67-4136-be3a-70747e3f7f8b'::uuid, 'artist'::soundpub.app_role, '2026-02-04T08:31:45.348838+00:00'::timestamptz, 'dee9803d-3f3a-419f-9b28-05989227cf29'::uuid),
  ('26feafe0-9717-4143-8cd2-b146769952ae'::uuid, 'artist'::soundpub.app_role, '2026-04-07T19:34:07.390415+00:00'::timestamptz, '2a58f3c9-7c77-474a-8f16-520cca7e881e'::uuid),
  ('5a2ea964-a42b-4ca4-bc2e-08d9a0c1c480'::uuid, 'artist'::soundpub.app_role, '2026-04-08T02:33:32.152128+00:00'::timestamptz, 'c4d25798-62bf-4381-b606-d119c9f87aed'::uuid),
  ('0e7a6b2e-5036-4cd7-ae7e-66e62ad7964b'::uuid, 'artist'::soundpub.app_role, '2026-04-08T08:47:25.297604+00:00'::timestamptz, '675ef149-a4b5-48eb-8ac3-e15c517431f6'::uuid),
  ('6a6b4d28-5c11-4f16-89bc-9e8bb0c062a3'::uuid, 'artist'::soundpub.app_role, '2026-04-07T18:12:45.197786+00:00'::timestamptz, 'd9fd69ce-f57d-48cd-b9bc-a993db90a11e'::uuid),
  ('5b29ef67-8857-4f69-8237-cb35cac928de'::uuid, 'artist'::soundpub.app_role, '2026-04-08T12:14:50.440923+00:00'::timestamptz, 'd61cacee-5e5a-4339-af29-e2a30dbef319'::uuid),
  ('fad16234-e047-458e-8b69-45d106ae4138'::uuid, 'artist'::soundpub.app_role, '2026-04-09T04:42:29.903601+00:00'::timestamptz, '3f2c5799-afb0-4329-8509-1fe32abe05c5'::uuid),
  ('08fedd4f-60de-4252-9583-0954d4903789'::uuid, 'artist'::soundpub.app_role, '2026-04-09T04:42:44.406084+00:00'::timestamptz, 'c7f7a240-73d4-4f64-be84-620cab0697b2'::uuid),
  ('994d97e5-a9d0-4be3-b37a-4ed754391447'::uuid, 'artist'::soundpub.app_role, '2026-04-10T09:55:27.352255+00:00'::timestamptz, '7a18ff64-9d03-4f85-9e06-f4d93a5d738f'::uuid),
  ('569e3798-531c-41b5-8c48-4245628a89f9'::uuid, 'artist'::soundpub.app_role, '2026-04-11T07:23:12.119027+00:00'::timestamptz, 'c4e42511-cdc2-4e00-9ae9-1bea6950204d'::uuid),
  ('784d3a5f-b4df-471d-b5a0-839b5f8ffb59'::uuid, 'artist'::soundpub.app_role, '2026-04-11T10:35:28.445334+00:00'::timestamptz, '87270046-da67-4391-93b9-536cd7cece86'::uuid),
  ('8bbac22c-6192-4554-9929-55b4dece4804'::uuid, 'artist'::soundpub.app_role, '2026-04-12T15:37:13.04049+00:00'::timestamptz, '60e646d1-834d-46dd-8685-9f62ba5ef43d'::uuid),
  ('61384c4c-709a-49d5-b2d3-e4aa523ce7c1'::uuid, 'whitelabel'::soundpub.app_role, '2026-04-13T12:53:32.417841+00:00'::timestamptz, 'a9429976-e282-45af-91da-6df4bf7ed4c0'::uuid),
  ('866081fa-7b57-4fdf-ad2c-f717e49c23bd'::uuid, 'whitelabel'::soundpub.app_role, '2026-04-13T12:54:06.920435+00:00'::timestamptz, '3b94080b-0dec-43d9-8da1-631c3609e537'::uuid),
  ('6a52dafb-e746-49e8-91ec-1670bac1e00c'::uuid, 'artist'::soundpub.app_role, '2026-04-14T07:10:43.834596+00:00'::timestamptz, '000ecba1-3f8c-4caa-acbf-a45369f60d1e'::uuid),
  ('b4bbbaf8-2486-4d7f-b876-5435d09b3c1d'::uuid, 'artist'::soundpub.app_role, '2026-04-22T01:38:00.116176+00:00'::timestamptz, '8f716605-67dd-4d65-8b43-5b15b3bb1deb'::uuid),
  ('0e950462-1186-4ba1-a911-2c9d33f7380c'::uuid, 'artist'::soundpub.app_role, '2026-05-12T09:42:47.987574+00:00'::timestamptz, 'c0415bd6-06a1-4b96-be34-8027f914588c'::uuid),
  ('9cb09072-b24b-4778-87fb-4536ccbcd1b9'::uuid, 'whitelabel'::soundpub.app_role, '2026-05-16T12:36:19.717434+00:00'::timestamptz, 'edec1e41-0555-49cb-80f7-2ba19cba541e'::uuid),
  ('9e1131f5-07ca-429f-831e-21786c15af47'::uuid, 'artist'::soundpub.app_role, '2026-05-22T10:20:44.665462+00:00'::timestamptz, 'd4b77b30-ee85-4089-89fa-4eb7fd898738'::uuid),
  ('edd4ebe6-3a94-46f3-b51e-39ebddfad2d6'::uuid, 'artist'::soundpub.app_role, '2026-05-26T06:50:39.037499+00:00'::timestamptz, '3403b4d9-50b4-4971-b58b-3086991844cb'::uuid),
  ('31dc0193-e561-4e6c-9c43-d5a0800d2d66'::uuid, 'artist'::soundpub.app_role, '2026-06-09T10:11:11.311285+00:00'::timestamptz, '387647b5-8b46-45ed-80bd-c73bb98da404'::uuid),
  ('5775d981-0dee-4c12-88a6-3359b3036ddf'::uuid, 'artist'::soundpub.app_role, '2026-06-09T10:14:33.782865+00:00'::timestamptz, '13a56d7d-6612-4170-a8a2-b2706ee60096'::uuid),
  ('5acd616f-acec-41c3-88fa-4fc41ea5135e'::uuid, 'artist'::soundpub.app_role, '2026-06-09T17:05:31.774126+00:00'::timestamptz, 'e0430a31-988b-47a1-8a56-3815bc96ffdf'::uuid),
  ('dad42acb-87e2-44da-8e1e-019ee15a0500'::uuid, 'artist'::soundpub.app_role, '2026-06-12T10:57:44.950127+00:00'::timestamptz, '36afe424-85c7-42c4-8851-9fc2ca76518d'::uuid),
  ('798afe9b-5cb8-4547-ab9e-31819468f5d4'::uuid, 'artist'::soundpub.app_role, '2026-06-19T09:06:02.403074+00:00'::timestamptz, '8aa6ae1f-1d64-47b1-98fb-25df959355f7'::uuid),
  ('f2aa0221-f164-4ddc-a22d-449bd9ca66eb'::uuid, 'artist'::soundpub.app_role, '2026-06-19T11:25:24.143137+00:00'::timestamptz, 'bb6d7ce6-3085-4afd-83ce-c9649ef27ba8'::uuid),
  ('f5826e53-35ba-48ba-937f-daf7099c42fc'::uuid, 'artist'::soundpub.app_role, '2026-06-19T12:27:55.835097+00:00'::timestamptz, 'd9939a95-7e81-4a9b-a3b4-0b9b3c12d09e'::uuid),
  ('9948e35d-f006-4817-b3bd-ba9a9ab62563'::uuid, 'artist'::soundpub.app_role, '2026-06-19T23:57:43.216234+00:00'::timestamptz, '6660291a-7d48-47a8-bf1a-18df858d3e3a'::uuid),
  ('fb764703-0dbc-4fbc-a5d0-920d7ee72cee'::uuid, 'artist'::soundpub.app_role, '2026-06-21T15:53:37.740632+00:00'::timestamptz, '38f6cfa7-a686-4408-b8e4-61ec6686c834'::uuid),
  ('307bc021-c6ac-439a-a729-766471c50818'::uuid, 'artist'::soundpub.app_role, '2026-06-22T06:03:41.919136+00:00'::timestamptz, 'd5e08c7e-6121-474a-bddc-9a9a3f72614e'::uuid),
  ('27f4586c-22d5-4ea0-b6c7-5be39910b676'::uuid, 'artist'::soundpub.app_role, '2026-06-22T08:16:09.673051+00:00'::timestamptz, '2ffe41ab-c8e6-4452-ac39-81cb74728a51'::uuid),
  ('cb1e439c-1836-4c19-88ec-4a0dcb1aba5f'::uuid, 'artist'::soundpub.app_role, '2026-06-22T17:52:57.410873+00:00'::timestamptz, 'c0650eec-0f67-4e67-a696-b4ba1a66ef88'::uuid),
  ('1cef684e-c6e4-42ab-bc15-2080bcdef2b3'::uuid, 'artist'::soundpub.app_role, '2026-06-23T05:50:31.73476+00:00'::timestamptz, '7d295978-6cab-4803-b903-8f66f4598784'::uuid),
  ('97d83d07-f8f6-4f63-be4b-a31ec3d5dd48'::uuid, 'artist'::soundpub.app_role, '2026-06-23T18:37:19.525744+00:00'::timestamptz, 'a26ca2cc-fca8-47f7-b144-baf96f62928b'::uuid),
  ('cc5b879d-706e-4d86-bd84-d5703a368b13'::uuid, 'artist'::soundpub.app_role, '2026-06-24T07:42:15.557675+00:00'::timestamptz, 'f5c442de-6674-4e8a-877a-363aa149e3a1'::uuid),
  ('481dc3d8-440c-4fa5-9639-9aa601b37a1b'::uuid, 'artist'::soundpub.app_role, '2026-06-24T08:07:11.758927+00:00'::timestamptz, 'f413bddd-b962-4c5f-baf6-18135b612843'::uuid),
  ('61e2d0d9-ac7f-43d0-8530-26f1809e7ac4'::uuid, 'artist'::soundpub.app_role, '2026-06-24T11:45:00.367241+00:00'::timestamptz, 'e3030f65-8f66-446c-b4fe-6968c5284ad0'::uuid),
  ('e03a6d9b-8d33-4ad6-9473-5155f05d3f16'::uuid, 'artist'::soundpub.app_role, '2026-06-24T18:43:09.512841+00:00'::timestamptz, 'ef0d2863-d3f4-4a64-935d-89558b374bee'::uuid),
  ('677fc72f-aeb8-4189-804e-4ff4c1847807'::uuid, 'artist'::soundpub.app_role, '2026-06-28T10:15:51.868102+00:00'::timestamptz, '42a06b73-7795-45b2-ad35-bb101d7fcf9a'::uuid);

-- Preview users whose roles will change.
SELECT
  p.email,
  p.full_name,
  s.user_id,
  array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role IS NOT NULL) AS current_roles,
  array_agg(DISTINCT s.role::text ORDER BY s.role::text) AS csv_roles
FROM tmp_soundpub_user_roles_source s
LEFT JOIN soundpub.user_roles ur ON ur.user_id = s.user_id
LEFT JOIN soundpub.profiles p ON p.id = s.user_id
GROUP BY p.email, p.full_name, s.user_id
HAVING array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role IS NOT NULL)
   IS DISTINCT FROM array_agg(DISTINCT s.role::text ORDER BY s.role::text)
ORDER BY p.email NULLS LAST, p.full_name NULLS LAST;

-- Replace roles only for users present in this CSV.
DELETE FROM soundpub.user_roles ur
USING (SELECT DISTINCT user_id FROM tmp_soundpub_user_roles_source) s
WHERE ur.user_id = s.user_id;

INSERT INTO soundpub.user_roles (user_id, role, created_at)
SELECT user_id, role, COALESCE(created_at, now())
FROM tmp_soundpub_user_roles_source
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify final role counts for imported CSV users.
SELECT ur.role::text AS role, count(*) AS total
FROM soundpub.user_roles ur
JOIN (SELECT DISTINCT user_id FROM tmp_soundpub_user_roles_source) s ON s.user_id = ur.user_id
GROUP BY ur.role
ORDER BY ur.role::text;

COMMIT;
