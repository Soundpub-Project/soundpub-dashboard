# Persistent Project Context

## Supabase Hosting

- This project uses self-hosted Supabase, not Supabase Cloud.
- SSH endpoint: `maskhar@20.20.20.173`.
- SSH host alias: `maskhar@supabase-server`.
- Supabase Docker directory on server: `~/docker/supabase/supabase-1.26.05/docker`.
- Before deploying or inspecting Supabase services, use SSH and work from that Docker directory.
- Never place SSH passwords, private keys, Spotify secrets, or Supabase secrets in repository files, chat memory, source code, or frontend environment variables.

## Edge Function Deployment

- For every new or changed Supabase Edge Function, deploy source through `scp` to self-hosted server. Do not use `supabase functions deploy` for this project.
- Before first upload in a session, inspect Docker Compose volume mappings on `maskhar@supabase-server` from `~/docker/supabase/supabase-1.26.05/docker` and confirm remote Edge Function source directory.
- Upload only intended function directory and related shared files. Preserve remote secrets and configuration files.
- After upload, run required self-hosted Docker reload or rebuild command from that Docker directory, then verify function endpoint or container logs.
- Confirmed remote Edge Function volume source directory: `~/docker/supabase/supabase-1.26.05/docker/volumes/functions`.
- The Docker Compose service name is `functions`; it reads `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` through Compose environment interpolation. Set these values in Docker directory `.env`, then recreate with `docker compose up -d --force-recreate functions`.
