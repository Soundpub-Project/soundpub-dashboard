# SoundPub Dashboard — Panduan Setup Supabase Self-Hosted di VPS

Panduan lengkap deploy **Supabase self-hosted** + **SoundPub Dashboard**
di VPS pribadi.

Update: Agustus 2026 (schema `soundpub-dashboard`).

> Setelah infra siap, ikuti [`MIGRATION-GUIDE.md`](./MIGRATION-GUIDE.md)
> untuk migrasi data + [`MIGRATION-CHECKLIST.md`](./MIGRATION-CHECKLIST.md)
> untuk sanity check.

## Daftar Isi

1. [Persyaratan Server](#1-persyaratan-server)
2. [Instalasi Docker](#2-instalasi-docker)
3. [Setup Supabase Self-Hosted](#3-setup-supabase-self-hosted)
4. [Konfigurasi Database](#4-konfigurasi-database)
5. [Deploy Edge Functions](#5-deploy-edge-functions)
6. [Konfigurasi Storage](#6-konfigurasi-storage)
7. [Nginx + SSL/HTTPS](#7-nginx--sslhttps)
8. [Email di Self-Host](#8-email-di-self-host)
9. [Monitoring & Backup](#9-monitoring--backup)
10. [Troubleshooting](#10-troubleshooting)
11. [Quick Reference](#11-quick-reference)

---

## 1. Persyaratan Server

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU      | 2 cores | 4+ cores    |
| RAM      | 4 GB    | 8+ GB       |
| Storage  | 40 GB SSD | 200+ GB SSD (media library besar) |
| OS       | Ubuntu 22.04 LTS | Ubuntu 22.04/24.04 LTS |

### Software

- Docker Engine 24+
- Docker Compose plugin 2.20+
- Git, curl, `psql` (postgres client 15+)
- (Opsional) Supabase CLI untuk deploy edge functions
- (Opsional) Node 20 + `bun` untuk build frontend di server

### Domain & Port

- 3 subdomain (contoh):
  - `api.yourdomain.com`       → Kong / API gateway
  - `studio.yourdomain.com`    → Supabase Studio (proteksi IP allowlist)
  - `dashboard.yourdomain.com` → SoundPub Dashboard (frontend)
- Port yang wajib dibuka: **80**, **443**, **22** (SSH). Port 5432 (DB)
  ditutup dari publik — akses via SSH tunnel saja.

---

## 2. Instalasi Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

---

## 3. Setup Supabase Self-Hosted

### Clone dan konfigurasi

```bash
mkdir -p ~/supabase && cd ~/supabase
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker
cp .env.example .env
```

### Generate secret

```bash
# Postgres password (64 char)
openssl rand -hex 32

# JWT secret (min 32 char)
openssl rand -hex 32

# ANON_KEY & SERVICE_ROLE_KEY di-generate dari JWT_SECRET
# https://supabase.com/docs/guides/self-hosting#api-keys
#   - anon      : role='anon',         exp=now+10yr
#   - service   : role='service_role', exp=now+10yr
```

### Isi `.env` (bagian yang WAJIB diganti)

```env
POSTGRES_PASSWORD=<hasil openssl>
JWT_SECRET=<hasil openssl, 32+ hex>
ANON_KEY=<jwt anon>
SERVICE_ROLE_KEY=<jwt service_role>

DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<password kuat>

SITE_URL=https://dashboard.yourdomain.com
API_EXTERNAL_URL=https://api.yourdomain.com
STUDIO_DEFAULT_ORGANIZATION=SoundPub
STUDIO_DEFAULT_PROJECT=soundpub-self

# SMTP untuk Auth email (confirm, reset password)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=<smtp password>
SMTP_SENDER_NAME=SoundPub
SMTP_ADMIN_EMAIL=admin@yourdomain.com

# Enable auth providers yang dipakai
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<google oauth id>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<google oauth secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/v1/callback
```

### Start

```bash
docker compose up -d
docker compose ps    # semua service: healthy
docker compose logs -f    # sanity check
```

### Verifikasi

```bash
curl -H "apikey: $ANON_KEY" http://localhost:8000/rest/v1/
# Studio (proxy nanti via Nginx)
curl -I http://localhost:3000
```

---

## 4. Konfigurasi Database

### Aktifkan extension

```bash
docker exec -it supabase-db psql -U postgres -d postgres <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
```

### Deploy skema

```bash
scp docs/full-schema-v2.sql user@vps:/tmp/
docker exec -i supabase-db psql -U postgres -d postgres < /tmp/full-schema-v2.sql
```

### Cek

```sql
\dt "soundpub-dashboard".*
\df "soundpub-dashboard".*
SELECT COUNT(*) FROM pg_policies WHERE schemaname='soundpub-dashboard';
SELECT id, public FROM storage.buckets ORDER BY id;
```

### Buat admin pertama

```bash
# via Auth Admin API (jangan INSERT langsung ke auth.users)
curl -X POST "http://localhost:8000/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"KuatSekali!","email_confirm":true,"user_metadata":{"full_name":"Super Admin"}}'
```

Setelah user dibuat (trigger `handle_new_user` otomatis insert `profiles`
+ `user_roles` role `artist`):

```sql
UPDATE "soundpub-dashboard".user_roles
   SET role = 'superadmin'
 WHERE user_id = (SELECT id FROM auth.users WHERE email='admin@yourdomain.com');
```

---

## 5. Deploy Edge Functions

Supabase self-hosted memakai container `functions` (Deno). Simpan
function di path yang di-mount container:

```bash
cd ~/supabase/supabase/docker
# path default: ./volumes/functions/
mkdir -p volumes/functions
rsync -avz path/to/soundpub/supabase/functions/ volumes/functions/

# jangan lupa import_map.json / _shared/ ikut ter-copy

docker compose restart functions
docker compose logs -f functions
```

### Set secret untuk edge function

Supabase self-hosted membaca secret dari environment container
`functions`. Tambahkan di `supabase/docker/.env`:

```env
# SSO ICCN
SSO_REALM_URL=https://sso.iccn.or.id/realms/PORTALICCN
SSO_CLIENT_ID=soundpub
ICCN_MEDIA_LABEL_ID=<uuid>

# Xendit
XENDIT_SECRET_KEY=xnd_...
XENDIT_WEBHOOK_TOKEN=...

# Email
NOTIFICATION_EMAIL=notif@yourdomain.com
RESEND_API_KEY=<opsional, kalau pakai Resend>

# GCS media library
GCS_PROJECT_ID=...
GCS_BUCKET_NAME=...
GCS_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Spotify
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

Referensikan ke service `functions` di `docker-compose.yml` (block
`functions.environment`) atau override lewat `.env` yang sudah dibaca
Compose. Restart:

```bash
docker compose up -d functions
```

### Test manual

```bash
curl -X POST http://localhost:8000/functions/v1/info-soundpub \
  -H "apikey: $ANON_KEY"
```

---

## 6. Konfigurasi Storage

### Buat bucket

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('track-audio','track-audio',false),
  ('track-video','track-video',false),
  ('audio-clips','audio-clips',true),
  ('release-covers','release-covers',false),
  ('label-logos','label-logos',true),
  ('avatars','avatars',true),
  ('iccn-gallery','iccn-gallery',true),
  ('klikus-biolink','klikus-biolink',true)
ON CONFLICT (id) DO NOTHING;
```

Policy (folder-scoped INSERT/UPDATE/DELETE + `Scoped read release-covers`)
sudah include di `full-schema-v2.sql`.

### Persistent volume

Edit `docker-compose.yml` (bagian `storage`):

```yaml
services:
  storage:
    volumes:
      - /data/supabase/storage:/var/lib/storage
```

```bash
sudo mkdir -p /data/supabase/storage
sudo chown -R 1000:1000 /data/supabase/storage
```

---

## 7. Nginx + SSL/HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/soundpub`:

```nginx
# API gateway (Kong)
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 500M;   # upload track 500MB

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
}

# Studio (batasi IP admin)
server {
    listen 80;
    server_name studio.yourdomain.com;
    allow 203.0.113.10;
    deny  all;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Frontend SoundPub Dashboard
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    root /var/www/soundpub-dashboard;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # cache asset build
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/soundpub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com \
                    -d studio.yourdomain.com \
                    -d dashboard.yourdomain.com
# auto renew (systemd timer sudah aktif default certbot)
```

---

## 8. Email di Self-Host

Di Lovable Cloud, edge function `send-app-email` +
`send-royalty-notification` memakai **Gmail connector** (secret
`GOOGLE_MAIL_API_KEY`). Connector ini **tidak tersedia** di self-host.
Pilih salah satu jalur di bawah dan sesuaikan helper email di function.

### Opsi A — Resend (paling cepat)

1. Set `RESEND_API_KEY` di `.env`.
2. Di `supabase/functions/send-app-email/index.ts` dan
   `send-royalty-notification/index.ts`, ganti helper `sendGmail(...)`
   dengan `fetch("https://api.resend.com/emails", ...)`.
3. Verifikasi domain sender di Resend + tambah SPF/DKIM record ke DNS.

### Opsi B — SMTP langsung (nodemailer / Deno smtp)

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
2. Ganti helper email dengan library `denomailer` (`nodemailer` for Deno).
3. Pakai relay yang sudah punya reputasi (SendGrid/Amazon SES) supaya
   tidak masuk spam.

### Opsi C — Gmail API pakai service account

Butuh Google Workspace + domain-wide delegation. Lebih rumit — hanya
recommended kalau tim harus tetap kirim dari `@your-workspace-domain`.

> Auth email (confirm/reset) tetap pakai `SMTP_*` di `supabase/docker/.env`
> — itu di-handle GoTrue, terpisah dari edge function.

---

## 9. Monitoring & Backup

### Log rotation Docker

`/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

```bash
sudo systemctl restart docker
```

### Backup harian DB + storage

```bash
cat > ~/backup-supabase.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR=/data/backups
DATE=$(date +%F_%H%M)
mkdir -p "$DIR"
docker exec supabase-db pg_dump -U postgres -Fc postgres > "$DIR/db_$DATE.dump"
tar -czf "$DIR/storage_$DATE.tar.gz" -C /data/supabase storage
find "$DIR" -type f -mtime +14 -delete
EOF
chmod +x ~/backup-supabase.sh

# crontab: harian 03:00 lokal + upload ke offsite (rclone/aws s3)
crontab -e
# 0 3 * * * /home/user/backup-supabase.sh >> /var/log/soundpub-backup.log 2>&1
```

### Backup Storage → Google Drive / S3 (app-level)

Cron `daily-storage-backup` di dalam Postgres (`pg_cron`) memanggil edge
function `backup-storage-to-drive`. Set schedule setelah edge function
deploy:

```sql
SELECT cron.schedule(
  'daily-storage-backup',
  '0 19 * * *',
  $$SELECT net.http_post(
      url := 'https://api.yourdomain.com/functions/v1/backup-storage-to-drive',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','<ANON_KEY>',
        'x-trigger','cron'
      ),
      body := '{}'::jsonb
    );$$
);
```

Ganti implementasi function-nya kalau target backup bukan Google Drive
(mis. S3, B2, Wasabi).

### Update Supabase image

```bash
cd ~/supabase/supabase/docker
docker compose pull
docker compose up -d
docker image prune -f
```

---

## 10. Troubleshooting

### Container tidak start

```bash
docker compose ps
docker compose logs <service>
docker stats
```

### Auth email tidak masuk

- Cek `docker compose logs auth` untuk error SMTP.
- Verifikasi record SPF/DKIM domain sender.
- Coba `SMTP_PORT=465` + `SMTP_SECURE=true` kalau provider butuh SSL.

### Upload storage 400 / RLS error

- Pastikan file path memakai `{userId}/{filename}` (folder-scoped policy).
- Cek `SELECT * FROM storage.buckets WHERE id='<bucket>'` — bucket exist.
- Cek policy: `SELECT policyname, cmd FROM pg_policies WHERE tablename='objects';`

### Edge function 500

```bash
docker compose logs -f functions
# atau via CLI
supabase functions logs <name> --project-ref self
```

### `auth.uid()` selalu NULL

`JWT_SECRET` di `docker/.env` **harus sama** dengan yang dipakai untuk
generate `ANON_KEY` & `SERVICE_ROLE_KEY`. Regenerate ketiganya kalau
tidak yakin.

### SSL renew gagal

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 11. Quick Reference

### Command

```bash
# start / stop
docker compose up -d
docker compose down

# restart service
docker compose restart auth      # atau: rest, storage, functions, kong, db

# log
docker compose logs -f <service>

# psql
docker exec -it supabase-db psql -U postgres

# pg_dump
docker exec supabase-db pg_dump -U postgres -Fc postgres > backup.dump

# restore
docker exec -i supabase-db pg_restore -U postgres -d postgres < backup.dump
```

### Service & port internal

| Service         | Container            | Port |
|-----------------|----------------------|------|
| PostgreSQL      | `supabase-db`        | 5432 |
| Kong (API GW)   | `supabase-kong`      | 8000 |
| GoTrue (Auth)   | `supabase-auth`      | 9999 |
| PostgREST       | `supabase-rest`      | 3000 |
| Realtime        | `supabase-realtime`  | 4000 |
| Storage         | `supabase-storage`   | 5000 |
| Studio          | `supabase-studio`    | 3000 |
| Edge Functions  | `supabase-edge-func` | 9000 |

### Struktur URL publik

```
https://dashboard.yourdomain.com          → Frontend SoundPub
https://api.yourdomain.com/rest/v1/*      → PostgREST
https://api.yourdomain.com/auth/v1/*      → GoTrue
https://api.yourdomain.com/storage/v1/*   → Storage
https://api.yourdomain.com/functions/v1/* → Edge Functions
https://studio.yourdomain.com             → Supabase Studio (allowlist)
```

---

*Dokumen ini bagian dari paket migrasi SoundPub Dashboard.*
*Last updated: Juli 2026.*