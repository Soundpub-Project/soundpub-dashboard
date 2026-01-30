# SoundPub Dashboard - Panduan Setup Supabase di VPS

Panduan lengkap untuk setup Supabase Self-Hosted di VPS server pribadi.

## Daftar Isi

1. [Persyaratan Server](#1-persyaratan-server)
2. [Instalasi Docker](#2-instalasi-docker)
3. [Setup Supabase Self-Hosted](#3-setup-supabase-self-hosted)
4. [Konfigurasi Database](#4-konfigurasi-database)
5. [Deploy Edge Functions](#5-deploy-edge-functions)
6. [Konfigurasi Storage](#6-konfigurasi-storage)
7. [Setup SSL/HTTPS](#7-setup-sslhttps)
8. [Migrasi Data](#8-migrasi-data)
9. [Monitoring & Maintenance](#9-monitoring--maintenance)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist Lengkap](#11-checklist-lengkap)

---

## 1. Persyaratan Server

### Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 30 GB SSD | 100+ GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Software Requirements

- Docker Engine 24.0+
- Docker Compose 2.20+
- Git
- curl
- Supabase CLI (optional, untuk deploy edge functions)

### Domain & Network

- Domain dengan SSL certificate (Let's Encrypt recommended)
- Port yang perlu dibuka:
  - `80` - HTTP
  - `443` - HTTPS
  - `5432` - PostgreSQL (optional, untuk akses langsung)
  - `8000` - Kong API Gateway (internal)

---

## 2. Instalasi Docker

### Ubuntu 22.04

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### Verifikasi

```bash
# Test Docker
docker run hello-world

# Check Docker Compose
docker compose version
# Output: Docker Compose version v2.x.x
```

---

## 3. Setup Supabase Self-Hosted

### Clone Supabase Docker

```bash
# Create directory
mkdir -p ~/supabase
cd ~/supabase

# Clone supabase docker setup
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker

# Copy environment file
cp .env.example .env
```

### Konfigurasi Environment

Edit file `.env`:

```bash
nano .env
```

**PENTING: Ubah nilai-nilai berikut dengan yang UNIK dan AMAN:**

```env
############
# Secrets
############

# Generate dengan: openssl rand -hex 32
POSTGRES_PASSWORD=your_super_secure_password_here

# Generate JWT secret dengan: openssl rand -hex 64
JWT_SECRET=your_jwt_secret_here

# Generate anon key dan service role key
# Gunakan: https://supabase.com/docs/guides/self-hosting#api-keys
ANON_KEY=your_anon_key_here
SERVICE_ROLE_KEY=your_service_role_key_here

# Dashboard credentials
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_dashboard_password

############
# URLs
############

# Ganti dengan domain Anda
SITE_URL=https://app.yourdomain.com
API_EXTERNAL_URL=https://api.yourdomain.com

# Studio (Supabase Dashboard)
STUDIO_PORT=3000

############
# Email (SMTP)
############

SMTP_ADMIN_EMAIL=admin@yourdomain.com
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_SENDER_NAME=SoundPub
```

### Generate API Keys

Gunakan script ini untuk generate JWT keys:

```bash
# Install jwt-cli (optional)
# atau gunakan online generator di:
# https://supabase.com/docs/guides/self-hosting#api-keys

# Contoh struktur JWT untuk anon key:
# {
#   "role": "anon",
#   "iss": "supabase",
#   "iat": 1700000000,
#   "exp": 2000000000
# }

# Contoh struktur JWT untuk service_role key:
# {
#   "role": "service_role",
#   "iss": "supabase",
#   "iat": 1700000000,
#   "exp": 2000000000
# }
```

### Start Supabase

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Verifikasi Instalasi

```bash
# Check all containers are running
docker compose ps

# Test API endpoint
curl http://localhost:8000/rest/v1/

# Access Studio (Dashboard)
# Open browser: http://your-server-ip:3000
```

---

## 4. Konfigurasi Database

### Jalankan Schema Migration

Setelah Supabase berjalan, jalankan schema SQL:

```bash
# Copy schema file ke server
scp public/exports/full-schema.sql user@your-server:~/supabase/

# Connect ke PostgreSQL container
docker exec -it supabase-db psql -U postgres -d postgres

# Atau jalankan langsung
docker exec -i supabase-db psql -U postgres -d postgres < ~/supabase/full-schema.sql
```

### Verifikasi Schema

```sql
-- Connect ke database
docker exec -it supabase-db psql -U postgres -d postgres

-- Check tables
\dt public.*

-- Check functions
\df public.*

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Exit
\q
```

### Buat Admin User Pertama

```sql
-- Via psql atau Supabase Studio SQL Editor

-- 1. Daftarkan user via Auth (atau gunakan API)
-- 2. Setelah user terdaftar, update role ke superadmin:

UPDATE public.user_roles 
SET role = 'superadmin' 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'admin@yourdomain.com'
);
```

---

## 5. Deploy Edge Functions

### Setup Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login (untuk download dependencies)
supabase login

# Link ke project (local)
cd ~/soundpub-dashboard
supabase init  # jika belum ada
```

### Deploy Functions ke Self-Hosted

Untuk self-hosted, edge functions perlu di-deploy secara manual:

```bash
# Copy functions ke server
scp -r supabase/functions/ user@your-server:~/supabase/functions/

# Di server, masuk ke folder supabase
cd ~/supabase/supabase/docker

# Start edge functions container
docker compose up -d functions
```

### Konfigurasi Secrets untuk Edge Functions

```bash
# Set secrets via environment variables di docker-compose.yml
# atau buat file secrets

# Contoh menambahkan secret:
docker exec supabase-edge-functions \
  /bin/sh -c "echo 'RESEND_API_KEY=your_key' >> /etc/supabase/secrets"
```

---

## 6. Konfigurasi Storage

### Buat Storage Buckets

```sql
-- Connect ke database
docker exec -it supabase-db psql -U postgres -d postgres

-- Buat buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('release-covers', 'release-covers', false),
  ('track-audio', 'track-audio', false),
  ('track-video', 'track-video', false),
  ('audio-clips', 'audio-clips', true),
  ('label-logos', 'label-logos', true)
ON CONFLICT (id) DO NOTHING;
```

### Konfigurasi Storage Volume

Edit `docker-compose.yml` untuk persistent storage:

```yaml
volumes:
  db-data:
    driver: local
  storage-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/supabase/storage
```

### Buat Directory untuk Storage

```bash
sudo mkdir -p /data/supabase/storage
sudo chown -R 1000:1000 /data/supabase/storage
```

---

## 7. Setup SSL/HTTPS

### Install Nginx

```bash
sudo apt install -y nginx
```

### Install Certbot (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Konfigurasi Nginx

Buat file `/etc/nginx/sites-available/supabase`:

```nginx
# API Endpoint
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Studio Dashboard
server {
    listen 80;
    server_name studio.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend App
server {
    listen 80;
    server_name app.yourdomain.com;

    root /var/www/soundpub;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (optional - jika ingin via same domain)
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Enable Site & Get SSL Certificate

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/supabase /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Get SSL certificates
sudo certbot --nginx -d api.yourdomain.com -d studio.yourdomain.com -d app.yourdomain.com

# Auto-renew (crontab)
sudo crontab -e
# Add: 0 0 1 * * certbot renew --quiet
```

---

## 8. Migrasi Data

### Export Data dari Lovable Cloud

1. Buka project di Lovable
2. Export data menggunakan SQL queries atau tools

### Import Data ke VPS

```bash
# Copy migration script
scp -r public/exports/migration-scripts/ user@your-server:~/migration/

# Di server
cd ~/migration
npm install

# Setup environment
cp .env.example .env
nano .env  # Isi dengan credentials

# Run migration
npm run migrate
```

### Migrasi Storage Files

```bash
# Download dari Lovable Cloud storage
# Upload ke VPS storage via Supabase API atau langsung ke storage folder

# Contoh upload via API:
curl -X POST "https://api.yourdomain.com/storage/v1/object/release-covers/image.jpg" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: image/jpeg" \
  --data-binary @image.jpg
```

---

## 9. Monitoring & Maintenance

### Setup Monitoring

```bash
# Install monitoring tools
docker compose -f docker-compose.monitoring.yml up -d
```

### Log Rotation

```bash
# Edit /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# Restart docker
sudo systemctl restart docker
```

### Backup Database

```bash
# Buat script backup
cat > ~/backup-supabase.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
docker exec supabase-db pg_dump -U postgres -d postgres > $BACKUP_DIR/db_$DATE.sql

# Backup storage (jika tidak pakai external storage)
tar -czf $BACKUP_DIR/storage_$DATE.tar.gz /data/supabase/storage

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x ~/backup-supabase.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /root/backup-supabase.sh >> /var/log/supabase-backup.log 2>&1
```

### Update Supabase

```bash
cd ~/supabase/supabase/docker

# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Cleanup old images
docker image prune -f
```

---

## 10. Troubleshooting

### Container tidak start

```bash
# Check logs
docker compose logs [service-name]

# Check resources
docker stats

# Restart specific service
docker compose restart [service-name]
```

### Database connection error

```bash
# Check if PostgreSQL is running
docker compose ps db

# Check PostgreSQL logs
docker compose logs db

# Test connection
docker exec -it supabase-db psql -U postgres -c "SELECT 1"
```

### Storage tidak bisa upload

```bash
# Check storage service
docker compose logs storage

# Check permissions
ls -la /data/supabase/storage

# Fix permissions
sudo chown -R 1000:1000 /data/supabase/storage
```

### Edge Functions error

```bash
# Check edge functions logs
docker compose logs functions

# Restart functions
docker compose restart functions
```

### SSL Certificate Issues

```bash
# Renew certificate manually
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

---

## 11. Checklist Lengkap

### Pre-Setup

- [ ] VPS sudah dibeli dan dapat diakses via SSH
- [ ] Domain sudah pointing ke IP VPS
- [ ] Firewall sudah dikonfigurasi (port 80, 443, 22)
- [ ] Backup credentials disimpan dengan aman

### Docker Installation

- [ ] Docker Engine terinstall
- [ ] Docker Compose terinstall
- [ ] User ditambahkan ke docker group
- [ ] Docker berjalan dengan baik (hello-world test)

### Supabase Setup

- [ ] Repository Supabase di-clone
- [ ] File .env dikonfigurasi dengan secrets yang aman
- [ ] JWT keys di-generate
- [ ] SMTP dikonfigurasi (untuk auth emails)
- [ ] Semua containers berjalan

### Database

- [ ] Schema SQL dijalankan
- [ ] Semua tables terbuat
- [ ] Semua functions terbuat
- [ ] RLS policies aktif
- [ ] Admin user pertama dibuat
- [ ] Test query berhasil

### Storage

- [ ] Semua buckets terbuat
- [ ] Storage policies aktif
- [ ] Volume persistent dikonfigurasi
- [ ] Test upload berhasil

### Edge Functions

- [ ] Functions ter-deploy
- [ ] Secrets dikonfigurasi
- [ ] Test endpoint berhasil

### SSL/HTTPS

- [ ] Nginx terinstall
- [ ] Virtual hosts dikonfigurasi
- [ ] SSL certificate ter-generate
- [ ] Auto-renew terjadwal
- [ ] Test HTTPS berhasil

### Data Migration

- [ ] Data dari Lovable Cloud di-export
- [ ] Migration script dikonfigurasi
- [ ] Data berhasil di-import
- [ ] Storage files di-upload
- [ ] Verifikasi data count cocok

### Monitoring & Backup

- [ ] Backup script dibuat
- [ ] Backup terjadwal (cron)
- [ ] Log rotation dikonfigurasi
- [ ] Monitoring aktif (optional)

### Frontend Deployment

- [ ] Build production frontend
- [ ] Upload ke server
- [ ] Nginx serving frontend
- [ ] Environment variables updated
- [ ] Test semua fitur

### Security

- [ ] Firewall aktif
- [ ] SSH key-only authentication
- [ ] Database password kuat
- [ ] JWT secrets aman
- [ ] SMTP credentials aman
- [ ] Regular security updates enabled

---

## Quick Reference

### Useful Commands

```bash
# Start Supabase
docker compose up -d

# Stop Supabase
docker compose down

# Restart specific service
docker compose restart [service]

# View logs
docker compose logs -f [service]

# Connect to database
docker exec -it supabase-db psql -U postgres

# Backup database
docker exec supabase-db pg_dump -U postgres > backup.sql

# Restore database
docker exec -i supabase-db psql -U postgres < backup.sql
```

### Service Names

| Service | Container Name | Port |
|---------|---------------|------|
| PostgreSQL | supabase-db | 5432 |
| Kong (API Gateway) | supabase-kong | 8000 |
| GoTrue (Auth) | supabase-auth | 9999 |
| PostgREST | supabase-rest | 3000 |
| Realtime | supabase-realtime | 4000 |
| Storage | supabase-storage | 5000 |
| Studio | supabase-studio | 3000 |
| Edge Functions | supabase-functions | 9000 |

---

*Dokumen ini dibuat untuk SoundPub Dashboard VPS Migration*
*Last updated: January 2026*
