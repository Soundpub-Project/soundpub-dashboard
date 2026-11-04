# Phase 3D storage dependency inventory

Scope: `src/` source, excluding generated Supabase types. Baseline captured October 29, 2026. This is a call-site inventory, not evidence that backend-mode calls have been removed. Classifications describe the required runtime boundary.

| Source | Usage | Classification |
| --- | --- | --- |
| `src/pages/ArtistProfile.tsx`, `src/pages/Settings.tsx` | Avatar upload and public URL | USER_AVATAR; Phase 3D backend mode |
| `src/components/settings/LabelLogoSettings.tsx`, `src/components/users/LabelAddArtistDialog.tsx` | Label logo upload and URL | LABEL_LOGO; Phase 3D backend mode |
| `src/components/releases/MediaUploadSection.tsx`, `src/components/releases/ReleaseFormDialog.tsx`, `src/components/releases/ReleaseFormPage.tsx`, `src/components/releases/ArtistReleaseFormDialog.tsx` | Cover/audio upload, long-lived signed URLs, hard-coded resumable Storage endpoint | RELEASE_COVER/TRACK_AUDIO; Phase 3D backend mode; old dialogs may remain legacy-only |
| `src/lib/audioClipper.ts` | Parse Supabase track-audio URL then sign | TRACK_AUDIO; no backend-mode string parsing |
| `src/pages/MediaLibrary.tsx` | Bucket listing, download signing, removal, references from release/track tables | Storage administration; backend mode must use authorized object metadata or fail closed |
| `src/components/settings/SuperAdminSettings.tsx` | Dashboard branding and favicon upload | Backend `OTHER/settings`; fixed resource, admin authority, verified binding, allowlisted public read |
| `src/components/settings/IccnIntegrationSettings.tsx` | ICCN gallery upload/URL | OTHER; unsupported backend-mode upload must fail closed |
| `src/pages/CopyrightDashboard.tsx`, `src/pages/CopyrightRegistrationReview.tsx` | Contract signing and upload | COPYRIGHT_DOCUMENT; Phase 3F legal workflow deferred, shared media behavior only |
| `src/pages/Takedown.tsx` | Takedown document upload | TAKEDOWN_DOCUMENT; Phase 3F legal workflow deferred |
| `src/pages/AdminPayouts.tsx`, `src/pages/Payouts.tsx` | Payout proof upload/sign | PHASE3E_FINANCIAL, not Phase 3D |

Bucket/prefix evidence: `avatars`, `release-covers`, `track-audio`, environment-selected contracts, `takedown-documents`, `payout-proofs`, `iccn-gallery`; user/release/track-generated object paths and legacy stored `avatar_url`, `logo_url`, `cover_url`, `audio_url`, `clip_url`. `src/lib/storagePaths.ts` parses old URL identities and is not backend storage authority. External GCS/cloud identities remain future migration inputs under `PHASE1G_STORAGE_INCLUSION_CONTRACT.md`; no fetch, byte import or provider credentials are authorized here. Backend media identity is object ID, not signed URL.

Recheck after integration: `rg -n 'supabase\.storage|createSignedUrl|getPublicUrl|storage/v1|googleapis|gcs' src`. Every remaining call requires an explicit legacy/deferred guard; unguarded backend-mode call blocks decoupling.
