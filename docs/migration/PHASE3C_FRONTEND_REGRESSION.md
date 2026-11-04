# Phase 3C Frontend Regression

## Status

PARTIAL

## Passing evidence

- `npm run build` passes.
- `node src/components/releases/backend-mode.test.cjs` passes adapter pagination, mount guards and versioned API contracts.
- `docs/migration/phase3c-browser.ts` passes mobile 390x844, tablet 768x1024 and desktop 1440x900 against real Vite proxy, Soundpub API and disposable PostgreSQL.
- Browser flows pass: draft Release create, persisted DB row, Track create, reload persistence, Track remove, Release detail and list.
- Release/Track API responses observed in browser were all 200 for accepted flows.
- No backend-mode request to Supabase `releases`, `tracks`, Release/Track RPC or Release/Track Edge Function was observed.

## Guarded/deferred behavior

- Legacy Release components remain mounted only in legacy mode. Backend mode uses `BackendReleaseForm` or explicit unavailable messages.
- Invoice/payment, Takedown, Royalty upload, Media orphan scan and Whitelabel combined views are unavailable in backend Release mode rather than issuing mixed Release/Track reads/writes.
- Public catalog Edge Function remains legacy-only; backend Release mode returns an empty catalog until a public catalog API exists.
- Dashboard counts and CSV exports use backend Release/Track services in backend mode.

## Missing acceptance

- Media upload and playback: Phase 3D.
- Payment, invoice, refund and paid-state lifecycle: later Payments work.
- Activation/provider distribution: later integration work.
- Full submission flow cannot pass because backend metadata mode intentionally has no cover/audio upload; submit fails closed.
- Loading, empty, 401, 403, 404, 409, 500 and network browser matrix is incomplete. API tests cover 400/401/404/409.
- Whole-project frontend TypeScript has existing unrelated and legacy generated-type failures; production Vite build passes.
