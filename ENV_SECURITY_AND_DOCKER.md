# 🔐 Environment Variables - Security & Docker Deployment Guide

## ⚠️ SECURITY ISSUE DITEMUKAN

### Problem
File .env.local saat ini berisi:
`
VITE_SUPABASE_SERVICE_KEY="eyJ..."
`

**Ini adalah SECURITY RISK!**

### Why It's Dangerous
- SERVICE_KEY adalah **SECRET** admin key
- Variabel dengan prefix VITE_ akan di-bundle ke frontend JavaScript
- **Exposed ke browser** → siapa saja bisa lihat di DevTools
- Full admin access jika dicuri!

### Fix
**HAPUS** VITE_SUPABASE_SERVICE_KEY dari .env.local segera!

Service key hanya untuk backend/Edge Functions, BUKAN frontend.

---

## 📋 .env.example Status untuk Docker

### ✅ Yang Sudah Komplit
.env.example sudah **LENGKAP** untuk:
- Frontend VITE variables
- Documentation untuk backend secrets
- Instruksi Lovable Cloud vs Self-hosted

### ⚠️ Yang Perlu Ditambahkan
Untuk full Docker deployment, perlu tambahan:
- Template .env.production (production frontend)
- Template supabase/docker/.env.example (backend secrets)

---

## 🐳 Docker Deployment Strategy

### Frontend (Dashboard)

**File Structure:**
\\\
.env.example         # Template (commit to git)
.env.local          # Local dev only (DON'T commit)
.env.production     # Production config
.gitignore          # Must exclude .env.local
\\\

**Required Variables (.env.production):**
\\\ash
# Supabase Frontend
VITE_SUPABASE_URL=https://supabase.carubra.com
VITE_SUPABASE_PROJECT_ID=default
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ... # PUBLIC key, safe to expose
VITE_DATABASE_SCHEMA=soundpub

# SSO ICCN
VITE_SSO_BASE_URL=https://sso.iccn.or.id
VITE_SSO_REALM=PORTALICCN
VITE_SSO_CLIENT_ID=soundpub
VITE_SSO_AUTO_REDIRECT=false

# Analytics (Optional)
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
\\\

**❌ NEVER Include:**
- VITE_SUPABASE_SERVICE_KEY (security risk!)
- Any passwords or secrets
- Private API keys

### Backend (Edge Functions)

**For Self-hosted Supabase:**

File: supabase/docker/.env atau Docker secrets

\\\ash
# Supabase Backend
SUPABASE_URL=https://supabase.carubra.com
SUPABASE_ANON_KEY=eyJ... # Same as PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=eyJ... # SECRET - only for backend!
DATABASE_SCHEMA=soundpub
SUPABASE_DB_SCHEMA=soundpub

# SSO Backend (if used)
SSO_REALM_URL=https://sso.iccn.or.id/realms/PORTALICCN
SSO_CLIENT_ID=soundpub
ICCN_MEDIA_LABEL_ID=<UUID-from-profiles-table>

# Payment Gateway (if used)
XENDIT_SECRET_KEY=xnd_...
XENDIT_WEBHOOK_TOKEN=...

# Email Service (if used)
NOTIFICATION_EMAIL=notifications@yourdomain.com
RESEND_API_KEY=re_... # or SMTP config

# Cloud Storage (if used)
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket
GCS_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Spotify API (if used)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Google Analytics (if used)
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
\\\

---

## 🚀 Docker Build Options

### Option 1: Build Arguments (Recommended)

\\\dockerfile
# Dockerfile
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DATABASE_SCHEMA
ARG VITE_SSO_BASE_URL
ARG VITE_SSO_REALM
ARG VITE_SSO_CLIENT_ID

ENV VITE_SUPABASE_URL=\
ENV VITE_SUPABASE_PROJECT_ID=\
ENV VITE_SUPABASE_PUBLISHABLE_KEY=\
ENV VITE_DATABASE_SCHEMA=\
ENV VITE_SSO_BASE_URL=\
ENV VITE_SSO_REALM=\
ENV VITE_SSO_CLIENT_ID=\

RUN bun run build
\\\

\\\ash
# Build command
docker build \\
  --build-arg VITE_SUPABASE_URL=https://supabase.carubra.com \\
  --build-arg VITE_SUPABASE_PROJECT_ID=default \\
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=eyJ... \\
  --build-arg VITE_DATABASE_SCHEMA=soundpub \\
  --build-arg VITE_SSO_BASE_URL=https://sso.iccn.or.id \\
  --build-arg VITE_SSO_REALM=PORTALICCN \\
  --build-arg VITE_SSO_CLIENT_ID=soundpub \\
  -t soundpub-dashboard:latest .
\\\

### Option 2: .env File Mount

\\\ash
# Create .env.production on host
cat > .env.production <<EOF
VITE_SUPABASE_URL=https://supabase.carubra.com
VITE_SUPABASE_PROJECT_ID=default
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_DATABASE_SCHEMA=soundpub
VITE_SSO_BASE_URL=https://sso.iccn.or.id
VITE_SSO_REALM=PORTALICCN
VITE_SSO_CLIENT_ID=soundpub
EOF

# Mount during build
docker build --env-file .env.production -t soundpub:latest .
\\\

### Option 3: Docker Compose (Recommended for complex setup)

\\\yaml
version: '3.8'
services:
  dashboard:
    build:
      context: .
      args:
        VITE_SUPABASE_URL: https://supabase.carubra.com
        VITE_SUPABASE_PROJECT_ID: default
        VITE_SUPABASE_PUBLISHABLE_KEY: \
        VITE_DATABASE_SCHEMA: soundpub
        VITE_SSO_BASE_URL: https://sso.iccn.or.id
        VITE_SSO_REALM: PORTALICCN
        VITE_SSO_CLIENT_ID: soundpub
    ports:
      - "3000:80"
    env_file:
      - .env.production
\\\

---

## ❓ FAQ: Bisa Pakai .env.local untuk Docker?

### ❌ NO - Production Docker

**.env.local adalah untuk LOCAL DEVELOPMENT saja:**
- Tidak boleh commit ke git
- Tidak aman untuk production
- Docker production harus pakai build args atau env file terpisah

### ✅ YES - Local Development

**Untuk development lokal:**
\\\ash
# .env.local for local dev
VITE_SUPABASE_URL=https://supabase.carubra.com
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
# etc...
\\\

**But remember:**
- Add .env.local to .gitignore
- NEVER commit to repository
- **REMOVE** VITE_SUPABASE_SERVICE_KEY immediately!

---

## 🔒 Security Best Practices

### DO ✅
- Use environment variables for config
- Separate frontend (VITE_*) from backend secrets
- Use Docker secrets for sensitive data
- Keep SERVICE_KEY only in backend
- Add .env.local to .gitignore
- Use .env.example as template (safe to commit)

### DON'T ❌
- Commit .env.local or .env.production to git
- Put SERVICE_KEY in frontend variables
- Expose secrets in browser JavaScript
- Use same config for dev and production
- Hardcode credentials in code

---

## 📝 Action Items

### IMMEDIATE (Security Fix):
1. **Remove VITE_SUPABASE_SERVICE_KEY from .env.local**
2. Verify .env.local is in .gitignore
3. Check git history - if committed, rotate the key!

### For Docker Deployment:
1. Create .env.production (don't commit)
2. Setup Docker build args in CI/CD
3. Configure backend secrets separately
4. Test build with production config

### For Documentation:
1. ✅ .env.example sudah lengkap untuk frontend
2. Consider adding supabase/docker/.env.example for backend
3. Add Docker deployment guide to README

---

## 📊 Summary

| Aspect | Status | Action Needed |
|--------|--------|---------------|
| .env.example | ✅ Komplit untuk frontend | None |
| .env.local | ⚠️ Has security issue | Remove SERVICE_KEY |
| Docker deployment | ⚠️ Needs setup | Create .env.production |
| Backend secrets | ⚠️ Needs template | Create supabase/docker/.env.example |
| Documentation | ✅ Good | Add Docker guide |

---

**Generated:** 2026-07-22 02:30 UTC  
**Priority:** 🔴 HIGH - Security issue needs immediate fix
