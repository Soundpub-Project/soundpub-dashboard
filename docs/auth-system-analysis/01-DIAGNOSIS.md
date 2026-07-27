# 🔐 AUTH SYSTEM ANALYSIS - SOUNDPUB DASHBOARD
**Tanggal:** 27 Juli 2026  
**Status:** DIAGNOSIS SELESAI - SOLUSI SIAP

---

## 📋 EXECUTIVE SUMMARY

Saya telah melakukan deep analysis terhadap sistem auth Soundpub dan menemukan **2 MASALAH KRITIS**:

### ❌ MASALAH #1: Google OAuth Error
**Error:** `Unable to exchange external code: 4/0AXEQxIB0w6bQmR14FzBcm9QvN19O1rLxb5cFXbi2RhyQcFV-DO6ckrKNnvZrsG4soF1x8A`

**Root Cause:**
- Supabase self-hosted tidak memiliki konfigurasi OAuth Google di `.env`
- Variabel `GOTRUE_EXTERNAL_GOOGLE_*` tidak ada atau tidak lengkap
- Authorization code dari Google tidak bisa di-exchange menjadi token

### ❌ MASALAH #2: Auto Role Assignment
**Problem:** User baru yang daftar manual tidak otomatis mendapat role `artist` dan tidak masuk ke label Soundpub

**Root Cause:**
- Trigger `handle_new_user()` hanya memberi role `user` (bukan `artist`)
- Tidak ada logic untuk assign `parent_label_id` ke label Soundpub
- Tidak ada entry di tabel `soundpub.artists`

---

## 🔍 CURRENT AUTH FLOW ANALYSIS

### 1️⃣ **Manual Signup Flow (Email/Password)**

```
User clicks "Daftar"
    ↓
Frontend calls: supabase.auth.signUp(email, password, metadata)
    ↓
Supabase creates user in auth.users
    ↓
TRIGGER: on_auth_user_created fires
    ↓
Function: soundpub.handle_new_user() executes:
    - INSERT into soundpub.profiles
    - INSERT into soundpub.user_roles with role='user' ❌ (WRONG!)
    ↓
User gets role='user' instead of 'artist' ❌
No parent_label_id assigned ❌
No entry in soundpub.artists ❌
```

**File:** `supabase/migrations/20260710151637_soundpub_rls_policies.sql`
```sql
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO soundpub.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::soundpub.app_role);  -- ❌ HARUS 'artist'
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;
```

---

### 2️⃣ **Google OAuth Flow**

```
User clicks "Masuk dengan Google"
    ↓
Frontend calls: supabase.auth.signInWithOAuth({ provider: 'google' })
    ↓
Redirect to: https://supabase.carubra.com/auth/v1/authorize?provider=google
    ↓
Supabase GoTrue redirects to Google OAuth
    ↓
Google returns authorization code
    ↓
Redirect back to: https://web.maskhar.com/?code=4/0AXEQxIB...
    ↓
Frontend auto-sends code to Supabase
    ↓
Supabase GoTrue calls Google Token Exchange API ❌ FAILS HERE!
    ↓
ERROR: "Unable to exchange external code"
```

**Why it fails:**
Supabase self-hosted needs these env vars in `.env`:
```bash
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=your_client_secret
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

**Missing:** These vars are NOT in your `.env` file!

---

### 3️⃣ **SSO (ICCN) Flow** ✅ WORKING

```
User clicks "Login via SSO"
    ↓
Redirect to Keycloak ICCN
    ↓
User authenticates at ICCN
    ↓
Redirect back with code + state
    ↓
Edge Function: sso-login/index.ts
    ↓
Exchange code for Keycloak token
    ↓
Verify JWT signature
    ↓
Find or create user in Supabase
    ↓
Assign role='artist' ✅
Set parent_label_id to ICCN Media label ✅
Create entry in soundpub.artists ✅
    ↓
Return Supabase session
```

**File:** `supabase/functions/sso-login/index.ts`
- Has proper logic for artist role assignment
- Has proper logic for parent_label_id
- Has proper logic for creating artist entry

**This flow works perfectly!** ✅

---

## 🏗️ DATABASE SCHEMA ANALYSIS

### Current Schema: `soundpub`

**Tables:**
1. `soundpub.profiles` - User profiles
2. `soundpub.user_roles` - User role assignments
3. `soundpub.artists` - Artist-specific data
4. `soundpub.releases` - Music releases
5. `soundpub.tracks` - Tracks
6. `soundpub.royalties` - Royalty data
7. `soundpub.payout_requests` - Payout requests

**Key Relationships:**
```
auth.users (Supabase Auth)
    ↓ (1:1)
soundpub.profiles
    ↓ (1:n)
soundpub.user_roles
    ↓ (1:1)
soundpub.artists (if role='artist')
```

**Missing Logic in `handle_new_user()`:**
- No check for default label (Soundpub Music)
- No artist entry creation
- No parent_label_id assignment

---

## 🎯 REQUIRED LABELS

Sistem Soundpub memiliki 2 label utama:

1. **Soundpub Music** (default label untuk semua artist manual signup)
2. **ICCN Media** (label untuk artist dari SSO ICCN)

**Problem:** Belum ada seed data untuk labels ini!

---

## 🔧 SOLUTION ARCHITECTURE

### Fix #1: Google OAuth Configuration

**Steps:**
1. Get Google OAuth credentials from Google Cloud Console
2. Add env vars to Supabase `.env` file
3. Restart `auth` service
4. Test Google login

**Required Env Vars:**
```bash
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=<your-client-secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

---

### Fix #2: Auto Role Assignment

**Strategy:** Update `handle_new_user()` function to:
1. Create profile in `soundpub.profiles`
2. Assign role `artist` (not `user`)
3. Set `parent_label_id` to Soundpub Music label
4. Create entry in `soundpub.artists`

**Implementation:**
- Create migration file with new trigger function
- Add seed data for Soundpub Music label
- Update `handle_new_user()` logic

---

## 📊 COMPARISON: SSO vs Manual Signup

| Feature | SSO (ICCN) ✅ | Manual Signup ❌ |
|---------|---------------|------------------|
| Create profile | ✅ Yes | ✅ Yes |
| Assign role | ✅ artist | ❌ user (wrong!) |
| Set parent_label | ✅ ICCN Media | ❌ NULL |
| Create artist entry | ✅ Yes | ❌ No |
| Mark password_set | ✅ false | ✅ false (via metadata) |

**Conclusion:** Manual signup tidak konsisten dengan SSO flow!

---

## 🚀 NEXT STEPS

1. ✅ Diagnosis complete (this document)
2. 🔄 Create migration for fixed `handle_new_user()` function
3. 🔄 Create seed data for Soundpub Music label
4. 🔄 Document Google OAuth setup steps
5. 🔄 Create testing checklist

---

**Generated by:** Kiro AI  
**Thread:** Fix 04 - Deep Auth System Analysis
