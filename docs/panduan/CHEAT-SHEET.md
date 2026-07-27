# 🚀 SUPABASE FIX - ONE PAGE CHEAT SHEET

**Problem:** `_env` file → Docker Compose can't read → Services down
**Solution:** Rename to `.env` → Restart
**Time:** 2 minutes

---

## ⚡ FASTEST FIX (Copy-Paste This)

```bash
# One-liner - Copy and paste to server terminal:
cd ~/docker/supabase/supabase/docker && mv _env .env && docker compose down && docker compose up -d && sleep 30 && docker compose ps
```

**Expected:** All services show "Up (healthy)"

---

## 🎯 AUTOMATED FIX (Recommended)

```bash
# 1. Upload script (from your local machine)
scp fix-env-rename.sh maskhar@supabase-server:~/

# 2. Run on server
ssh maskhar@supabase-server
chmod +x fix-env-rename.sh
./fix-env-rename.sh
```

---

## 📝 MANUAL STEP-BY-STEP

```bash
# Step 1: Navigate
cd ~/docker/supabase/supabase/docker

# Step 2: Backup (if .env exists)
[ -f .env ] && cp .env .env.backup.$(date +%s)

# Step 3: Rename
mv _env .env

# Step 4: Verify
ls -la .env
head -20 .env

# Step 5: Restart
docker compose down
docker compose up -d

# Step 6: Wait & Check
sleep 30
docker compose ps
```

---

## ✅ VERIFICATION (Run These After Fix)

```bash
# All should pass:
ls -la .env                                    # ✓ File exists
docker compose ps                              # ✓ All "Up (healthy)"
docker compose logs db --tail=10               # ✓ No errors
curl -I https://supabase.carubra.com          # ✓ HTTP 200/302
```

**Browser Test:**
- https://supabase.carubra.com → Dashboard loads ✓
- https://web.maskhar.com → Login with Google works ✓

---

## 🔥 TROUBLESHOOTING

### Still "unhealthy" after fix?

```bash
# Check logs
docker compose logs db --tail=50
docker compose logs auth --tail=50

# If .env is empty, use template:
curl -o .env https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example
nano .env  # Fill in required values
docker compose down && docker compose up -d
```

### "variable is not set" warning?

```bash
# Verify .env is in correct location
pwd  # Should be: /home/maskhar/docker/supabase/supabase/docker
ls -la docker-compose.yml .env  # Both in same directory

# Check file not empty
wc -l .env  # Should be > 50 lines
```

### Nuclear option (WARNING: DATA LOSS!)

```bash
docker compose down -v  # Removes all data!
docker compose up -d
```

---

## 🔑 GENERATE SECRETS (If .env Empty)

```bash
# POSTGRES_PASSWORD
openssl rand -base64 24

# JWT_SECRET
openssl rand -base64 32

# Copy outputs to .env file
nano .env
```

---

## 📦 FILES REFERENCE

| File | Use For |
|------|---------|
| **ACTION-PLAN-FINAL.md** | Complete action plan |
| **MASTER-INDEX.md** | Navigation all files |
| **QUICK-FIX-COMMANDS.md** | More commands |
| **fix-env-rename.sh** | Auto-fix script |
| **supabase-env-template.env** | Template .env |

---

## 🆘 EMERGENCY COMMANDS

```bash
# Stop all
docker compose down

# Restart specific service
docker compose restart auth

# View logs realtime
docker compose logs -f

# Check what's using port
sudo netstat -tulpn | grep 5432

# Restore backup
cp .env.backup.1234567890 .env
docker compose down && docker compose up -d
```

---

## 📊 SUCCESS CHECKLIST

- [ ] `ls -la .env` works (file exists)
- [ ] `docker compose ps` all healthy
- [ ] Dashboard accessible
- [ ] App login works

**All ✓? → DONE! 🎉**

---

**Need more details?** Read: ACTION-PLAN-FINAL.md or MASTER-INDEX.md

**Generated:** 2026-07-26 | **Version:** 1.0 | **Status:** Ready ✅

