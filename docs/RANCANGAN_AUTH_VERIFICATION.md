# 🔐 RANCANGAN SISTEM AUTENTIKASI & VERIFIKASI
**Soundpub Dashboard - Password Reset & Email Verification**

---

## 📋 RINGKASAN EKSEKUTIF

Dokumen ini merancang implementasi sistem **Lupa Password** dan **Verifikasi Email** untuk user artis yang mendaftar manual (bukan via Google OAuth). Sistem ini terintegrasi dengan **Supabase Self-hosted** menggunakan schema `Soundpub`.

### Tujuan Utama
1. Memberikan mekanisme pemulihan password yang aman
2. Memverifikasi kepemilikan email saat registrasi manual
3. Meningkatkan keamanan akun user
4. Mencegah spam dan akun palsu

---

## 🎯 ANALISIS SISTEM SAAT INI

### ✅ Kelebihan Sistem Existing

**1. Autentikasi Hybrid yang Fleksibel**
- Mendukung login Email/Password native
- Integrasi Google OAuth untuk kemudahan
- SSO dengan Keycloak (ICCN) untuk label besar
- Multi-provider memberikan fleksibilitas user

**2. Infrastruktur Email Sudah Siap**
- Edge function `send-app-email` sudah berjalan
- Template system sudah tersedia
- Email preference management (opt-in/opt-out)
- Email logging & tracking (`email_send_log`)
- Gmail API integration via Lovable connector

**3. Role-Based Access Control (RBAC)**
- Sudah ada table `user_roles` dengan 7 role
- Role: superadmin, admin, label, artist, user, copyright, whitelabel
- Permission system sudah matang

**4. Profile Management Lengkap**
- Table `profiles` dengan data lengkap
- Field `password_set`, `sso_provider`, `artist_profile_completed`
- Tracking subscription status

**5. Security Features**
- Row Level Security (RLS) policies aktif
- Protected routes di frontend
- Auth state management dengan React Context
- Token-based authentication via Supabase

### ⚠️ Kelemahan & Gap Sistem Saat Ini

**1. Tidak Ada Password Reset Flow**
- ❌ Tidak ada UI/UX untuk lupa password
- ❌ Tidak ada endpoint untuk request reset
- ❌ User terkunci jika lupa password (harus kontak admin)
- ❌ Tidak ada token management untuk reset

**2. Tidak Ada Email Verification Saat Signup**
- ❌ User langsung bisa login tanpa verifikasi email
- ❌ Risiko spam account & email palsu
- ❌ Tidak ada tracking status verifikasi
- ❌ Field `email_verified` tidak ada di profiles

**3. Security Concerns**
- ⚠️ Password reset token tidak terkelola
- ⚠️ Tidak ada rate limiting untuk reset request
- ⚠️ Tidak ada expiry mechanism untuk verification
- ⚠️ Tidak ada logging untuk security events

**4. User Experience Issues**
- ⚠️ Tidak ada feedback saat signup (cek email)
- ⚠️ Tidak ada resend verification option
- ⚠️ User bingung jika email belum terverifikasi
- ⚠️ Tidak ada blocked state untuk unverified users

**5. Template Email Belum Lengkap**
- ❌ Tidak ada template untuk password reset
- ❌ Tidak ada template untuk email verification
- ❌ Template existing hanya untuk notifikasi bisnis (payout, release, dll)

---

## 🏗️ RANCANGAN SISTEM BARU

### A. ARSITEKTUR OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vite)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Auth.tsx    │  │ ForgotPass   │  │ VerifyEmail     │    │
│  │ (Login/     │  │ .tsx         │  │ .tsx            │    │
│  │  Signup)    │  │              │  │                 │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
│         │                │                    │              │
│         └────────────────┴────────────────────┘              │
│                          │                                   │
│                   ┌──────▼──────┐                           │
│                   │  useAuth    │                           │
│                   │  Hook       │                           │
│                   └──────┬──────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │  Supabase Client    │
                │  (Auth SDK)         │
                └──────────┬──────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              SUPABASE BACKEND (Self-hosted)                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────┐      ┌────────────────────────┐    │
│  │  auth.users        │      │  Soundpub.profiles     │    │
│  │  - id              │◄────►│  - id                  │    │
│  │  - email           │      │  - email_verified      │    │
│  │  - confirmed_at    │      │  - verification_token  │    │
│  │  - recovery_token  │      │  - token_expires_at    │    │
│  └────────────────────┘      └────────────────────────┘    │
│           │                             │                    │
│           │                             │                    │
│  ┌────────▼─────────────────────────────▼───────────────┐  │
│  │         Edge Functions (Deno)                         │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  • send-password-reset                                │  │
│  │  • verify-email-token                                 │  │
│  │  • resend-verification                                │  │
│  │  • send-app-email (existing, update templates)        │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                ┌─────────▼──────────┐                       │
│                │  Gmail API         │                       │
│                │  (Lovable Gateway) │                       │
│                └────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

### B. DATABASE SCHEMA CHANGES

#### 1. Tambahan Kolom di `Soundpub.profiles`

```sql
-- Menambahkan tracking verifikasi email
ALTER TABLE Soundpub.profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;

-- Index untuk performa query token
CREATE INDEX IF NOT EXISTS idx_profiles_verification_token 
  ON Soundpub.profiles(verification_token) 
  WHERE verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_password_reset_token 
  ON Soundpub.profiles(password_reset_token) 
  WHERE password_reset_token IS NOT NULL;

-- Index untuk email verification status
CREATE INDEX IF NOT EXISTS idx_profiles_email_verified 
  ON Soundpub.profiles(email_verified);
```

#### 2. Table Baru: `Soundpub.auth_events` (Security Audit Log)

```sql
CREATE TABLE IF NOT EXISTS Soundpub.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, 
  -- 'password_reset_requested', 'password_reset_completed', 
  -- 'email_verification_sent', 'email_verified', 
  -- 'login_attempt_failed', 'login_success'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_events_user_id ON Soundpub.auth_events(user_id);
CREATE INDEX idx_auth_events_type ON Soundpub.auth_events(event_type);
CREATE INDEX idx_auth_events_created_at ON Soundpub.auth_events(created_at DESC);

-- RLS Policy
ALTER TABLE Soundpub.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own auth events"
  ON Soundpub.auth_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service can insert auth events"
  ON Soundpub.auth_events FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

#### 3. Table: `Soundpub.rate_limits` (Anti-spam)

```sql
CREATE TABLE IF NOT EXISTS Soundpub.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email atau IP
  action_type TEXT NOT NULL, -- 'password_reset', 'email_verification'
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  UNIQUE(identifier, action_type)
);

CREATE INDEX idx_rate_limits_identifier ON Soundpub.rate_limits(identifier, action_type);
CREATE INDEX idx_rate_limits_blocked ON Soundpub.rate_limits(blocked_until) 
  WHERE blocked_until IS NOT NULL;

-- Auto cleanup old entries (> 24 jam)
CREATE OR REPLACE FUNCTION Soundpub.cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM Soundpub.rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### C. EDGE FUNCTIONS (Supabase Functions)

#### 1. **send-password-reset** (Baru)

**Path:** `supabase/functions/send-password-reset/index.ts`

**Fungsi:**
- Terima request dengan email user
- Validasi email exist di database
- Generate secure token (crypto.randomUUID atau JWT)
- Simpan token + expiry (24 jam) ke `profiles`
- Check rate limiting (max 3x per jam per email)
- Kirim email via `send-app-email` dengan link reset
- Log event ke `auth_events`

**Input:**
```typescript
{
  email: string;
  recaptchaToken?: string; // Optional, untuk anti-bot
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
  rateLimitRemaining?: number;
}
```

**Flow:**
```
1. Validate email format
2. Check rate limit (3 requests/hour per email)
3. Query user by email from Soundpub.profiles
4. If not found → return generic success (security)
5. Generate secure token: crypto.randomUUID()
6. Set expiry: NOW() + 24 hours
7. Update profiles: verification_token, token_expires_at
8. Call send-app-email with template 'password-reset'
9. Log to auth_events
10. Return success
```

**Rate Limiting Logic:**
```sql
-- Upsert rate limit
INSERT INTO Soundpub.rate_limits (identifier, action_type, attempt_count, last_attempt_at)
VALUES ($email, 'password_reset', 1, NOW())
ON CONFLICT (identifier, action_type) 
DO UPDATE SET 
  attempt_count = Soundpub.rate_limits.attempt_count + 1,
  last_attempt_at = NOW(),
  blocked_until = CASE 
    WHEN Soundpub.rate_limits.attempt_count >= 3 
    THEN NOW() + INTERVAL '1 hour'
    ELSE NULL
  END
RETURNING attempt_count, blocked_until;
```

---

#### 2. **verify-password-reset-token** (Baru)

**Path:** `supabase/functions/verify-password-reset-token/index.ts`

**Fungsi:**
- Validasi token dari URL parameter
- Check expiry (24 jam)
- Return user info jika valid
- One-time use (token dihapus setelah digunakan)

**Input:**
```typescript
{
  token: string;
}
```

**Output:**
```typescript
{
  valid: boolean;
  userId?: string;
  email?: string;
  expiresAt?: string;
}
```

---

#### 3. **reset-password** (Baru)

**Path:** `supabase/functions/reset-password/index.ts`

**Fungsi:**
- Terima token + password baru
- Validasi token & expiry
- Update password via Supabase Admin API
- Clear token dari database
- Log event
- Kirim email konfirmasi

**Input:**
```typescript
{
  token: string;
  newPassword: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Flow:**
```
1. Validate token format & strength password
2. Query profile by password_reset_token
3. Check token expiry
4. Update auth.users password via Admin API
5. Clear password_reset_token from profiles
6. Log to auth_events: 'password_reset_completed'
7. Send confirmation email
8. Return success
```

---

#### 4. **send-verification-email** (Baru)

**Path:** `supabase/functions/send-verification-email/index.ts`

**Fungsi:**
- Dipanggil saat signup atau resend
- Generate verification token
- Kirim email dengan link verifikasi
- Set `email_verified = false`

**Input:**
```typescript
{
  userId: string;
  email: string;
  isResend?: boolean;
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Flow:**
```
1. Generate secure token
2. Set expiry: 7 days
3. Update profiles: verification_token, token_expires_at, verification_sent_at
4. Call send-app-email with template 'email-verification'
5. Log to auth_events
6. Return success
```

---

#### 5. **verify-email** (Baru)

**Path:** `supabase/functions/verify-email/index.ts`

**Fungsi:**
- Validasi verification token
- Set `email_verified = true`
- Update `auth.users.confirmed_at`
- Clear token

**Input:**
```typescript
{
  token: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
  redirectTo?: string;
}
```

**Flow:**
```
1. Query profile by verification_token
2. Check expiry (7 days)
3. Set email_verified = true
4. Update auth.users.confirmed_at via Admin API
5. Clear verification_token
6. Log to auth_events: 'email_verified'
7. Send welcome email (optional)
8. Return success with redirect URL
```

---

#### 6. Update **send-app-email** (Existing)

Tambahkan 3 template baru:

```typescript
// Template: password-reset
TEMPLATES['password-reset'] = (data, recipientName) => ({
  scope: 'security',
  subject: '🔐 Reset Password Anda - Soundpub',
  html: layout(
    'Reset Password',
    'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Kami menerima permintaan untuk reset password akun Soundpub Anda.</p>
      <p>Klik tombol di bawah untuk membuat password baru:</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${data.resetUrl}" 
           style="display:inline-block;background:#ef4444;color:#fff;
                  text-decoration:none;padding:14px 28px;border-radius:8px;
                  font-weight:600;">
          Reset Password
        </a>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        Link ini berlaku selama <strong>24 jam</strong>.<br>
        Jika Anda tidak meminta reset password, abaikan email ini.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">
        Atau copy link berikut:<br>
        <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;">
          ${data.resetUrl}
        </code>
      </p>
    `,
    'Reset Password',
    data.resetUrl
  )
});

// Template: email-verification
TEMPLATES['email-verification'] = (data, recipientName) => ({
  scope: 'security',
  subject: '✅ Verifikasi Email Anda - Soundpub',
  html: layout(
    'Verifikasi Email',
    'linear-gradient(135deg,#10b981 0%,#059669 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Terima kasih telah mendaftar di Soundpub! 🎵</p>
      <p>Klik tombol di bawah untuk verifikasi email Anda:</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${data.verifyUrl}" 
           style="display:inline-block;background:#10b981;color:#fff;
                  text-decoration:none;padding:14px 28px;border-radius:8px;
                  font-weight:600;">
          Verifikasi Email
        </a>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        Link ini berlaku selama <strong>7 hari</strong>.<br>
        Jika Anda tidak mendaftar, abaikan email ini.
      </p>
    `
  )
});

// Template: password-reset-confirmation
TEMPLATES['password-reset-confirmation'] = (data, recipientName) => ({
  scope: 'security',
  subject: '✅ Password Berhasil Direset - Soundpub',
  html: layout(
    'Password Berhasil Direset',
    'linear-gradient(135deg,#10b981 0%,#059669 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Password akun Soundpub Anda telah berhasil direset.</p>
      <p style="color:#6b7280;font-size:14px;">
        <strong>Waktu:</strong> ${new Date().toLocaleString('id-ID')}<br>
        <strong>IP Address:</strong> ${data.ipAddress || 'N/A'}
      </p>
      <p style="color:#ef4444;font-size:14px;margin-top:20px;">
        ⚠️ Jika Anda tidak melakukan perubahan ini, segera hubungi tim kami.
      </p>
    `,
    'Login Sekarang',
    data.loginUrl
  )
});
```

---

### D. FRONTEND IMPLEMENTATION

#### 1. Page: **ForgotPassword.tsx**

**Path:** `src/pages/ForgotPassword.tsx`

**Features:**
- Form input email
- Validasi email format (Zod)
- Loading state saat submit
- Success message (cek email)
- Rate limit error handling
- Link back to login

**UI Flow:**
```
┌──────────────────────────────────┐
│  🔐 Lupa Password?              │
├──────────────────────────────────┤
│                                  │
│  Email: [________________]       │
│                                  │
│  [Kirim Link Reset]              │
│                                  │
│  Kembali ke Login                │
└──────────────────────────────────┘

↓ (After submit)

┌──────────────────────────────────┐
│  ✅ Email Terkirim!              │
├──────────────────────────────────┤
│  Kami telah mengirim link reset  │
│  password ke email Anda.         │
│                                  │
│  Cek inbox atau folder spam.     │
│  Link berlaku 24 jam.            │
│                                  │
│  [Kembali ke Login]              │
└──────────────────────────────────┘
```

---

#### 2. Page: **ResetPassword.tsx**

**Path:** `src/pages/ResetPassword.tsx`

**Features:**
- Read token dari URL query params
- Validasi token saat mount
- Form password baru + konfirmasi
- Password strength indicator
- Show/hide password toggle
- Redirect ke login setelah sukses

---

#### 3. Page: **VerifyEmail.tsx**

**Path:** `src/pages/VerifyEmail.tsx`

**Features:**
- Auto-verify token dari URL
- Loading state saat verifikasi
- Success/error message
- Redirect to dashboard atau login
- Resend verification option

---

#### 4. Update **Auth.tsx** (Existing)

Tambahkan:
- Link "Lupa Password?" di form login
- Notifikasi "Cek email untuk verifikasi" setelah signup
- Banner warning jika email belum terverifikasi
- Button "Kirim Ulang Email Verifikasi"

```typescript
// Di form login, tambahkan:
<div className="flex justify-end">
  <Link 
    to="/forgot-password" 
    className="text-sm text-primary hover:underline"
  >
    Lupa Password?
  </Link>
</div>

// Setelah signup success:
const handleSignup = async (e: React.FormEvent) => {
  // ... existing code ...
  
  if (!error) {
    toast({
      title: 'Registrasi Berhasil',
      description: 'Cek email Anda untuk link verifikasi',
    });
    
    // Trigger send verification email
    await supabase.functions.invoke('send-verification-email', {
      body: {
        userId: data.user.id,
        email: data.user.email
      }
    });
  }
};

// Banner untuk unverified user (di dashboard):
{!profile?.email_verified && (
  <Alert variant="warning">
    <Shield className="h-4 w-4" />
    <AlertTitle>Email Belum Terverifikasi</AlertTitle>
    <AlertDescription>
      Verifikasi email Anda untuk akses penuh.
      <Button 
        variant="link" 
        onClick={handleResendVerification}
        className="ml-2"
      >
        Kirim Ulang
      </Button>
    </AlertDescription>
  </Alert>
)}
```

---

#### 5. Update **useAuth.tsx** Hook

Tambahkan helper functions:

```typescript
// Add to AuthContextType
interface AuthContextType {
  // ... existing ...
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  resendVerificationEmail: () => Promise<{ error: Error | null }>;
  isEmailVerified: boolean;
}

// Implement
const requestPasswordReset = async (email: string) => {
  const { data, error } = await supabase.functions.invoke(
    'send-password-reset',
    { body: { email } }
  );
  return { error: error as Error | null };
};

const resendVerificationEmail = async () => {
  if (!user || !profile) {
    return { error: new Error('User not logged in') };
  }
  
  const { data, error } = await supabase.functions.invoke(
    'send-verification-email',
    { 
      body: { 
        userId: user.id,
        email: user.email,
        isResend: true
      } 
    }
  );
  
  return { error: error as Error | null };
};

const isEmailVerified = profile?.email_verified === true;
```

---

#### 6. Protected Route Logic Update

**Path:** `src/components/auth/ProtectedRoute.tsx`

Tambahkan checking email verification:

```typescript
export function ProtectedRoute({ 
  children, 
  requireEmailVerified = false 
}: { 
  children: ReactNode;
  requireEmailVerified?: boolean;
}) {
  const { user, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check email verification if required
  if (requireEmailVerified && !profile?.email_verified) {
    return <Navigate to="/verify-email-required" replace />;
  }

  return <>{children}</>;
}
```

---

### E. ROUTING UPDATES

**Path:** `src/App.tsx` atau router config

```typescript
const router = createBrowserRouter([
  // ... existing routes ...
  
  {
    path: '/forgot-password',
    element: <ForgotPassword />
  },
  {
    path: '/reset-password',
    element: <ResetPassword />
  },
  {
    path: '/verify-email',
    element: <VerifyEmail />
  },
  {
    path: '/verify-email-required',
    element: <VerifyEmailRequired />
  },
  {
    path: '/resend-verification',
    element: <ResendVerification />
  }
]);
```

---

## 🔒 KEAMANAN & BEST PRACTICES

### 1. Token Security

**Token Generation:**
```typescript
// Gunakan crypto secure random
const token = crypto.randomUUID(); // atau
const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

**Token Storage:**
- Hash token sebelum simpan di database (optional, tapi recommended)
- Jangan kirim token di response body (hanya via email)
- Set expiry time yang reasonable (24 jam reset, 7 hari verification)

**Token Validation:**
```typescript
// Selalu check expiry
if (tokenExpiresAt < new Date()) {
  return { valid: false, error: 'Token expired' };
}

// One-time use: hapus token setelah digunakan
await supabase
  .from('profiles')
  .update({ verification_token: null })
  .eq('id', userId);
```

---

### 2. Rate Limiting Strategy

**Limits:**
- Password reset: 3 requests per hour per email
- Email verification resend: 5 requests per hour per user
- IP-based blocking untuk abuse detection

**Implementation:**
```typescript
const checkRateLimit = async (identifier: string, action: string) => {
  const { data } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('action_type', action)
    .maybeSingle();

  if (data?.blocked_until && new Date(data.blocked_until) > new Date()) {
    throw new Error('Rate limit exceeded. Try again later.');
  }

  if (data && data.attempt_count >= 3) {
    // Block for 1 hour
    await supabase
      .from('rate_limits')
      .update({ blocked_until: new Date(Date.now() + 3600000) })
      .eq('id', data.id);
    throw new Error('Too many attempts. Blocked for 1 hour.');
  }
};
```

---

### 3. Email Security

**Anti-Phishing:**
- Tampilkan nama user di email (personalisasi)
- Gunakan domain official: `noreply@Soundpub.xyz`
- Tambahkan footer dengan contact info
- Jangan include sensitive info di email

**Link Safety:**
```typescript
// Gunakan HTTPS
const resetUrl = `https://dashboard.Soundpub.xyz/reset-password?token=${token}`;

// Tambahkan domain verification
const verifyUrl = `https://dashboard.Soundpub.xyz/verify-email?token=${token}`;
```

---

### 4. Privacy & GDPR Compliance

**Data Retention:**
- Hapus token setelah used atau expired
- Auto-cleanup old auth_events (> 90 hari)
- User bisa request delete all auth logs

**User Control:**
- Opt-in email preferences sudah ada (`email_notif_*`)
- User bisa disable security emails (not recommended, tapi option tersedia)
- Export auth_events untuk transparency

---

### 5. Audit Trail

**Log Semua Events:**
```typescript
const logAuthEvent = async (
  userId: string,
  eventType: string,
  metadata: Record<string, any>,
  req: Request
) => {
  const ipAddress = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  await supabase.from('auth_events').insert({
    user_id: userId,
    event_type: eventType,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata
  });
};
```

---

## 📊 MONITORING & ANALYTICS

### Metrics to Track

1. **Email Delivery Rate**
   - Success rate email terkirim
   - Bounce rate
   - Time to deliver

2. **User Engagement**
   - Berapa % user verify email dalam 24 jam
   - Berapa % user complete password reset
   - Resend verification click rate

3. **Security Metrics**
   - Rate limit hits per day
   - Failed token validations
   - Suspicious IP patterns

4. **System Health**
   - Edge function latency
   - Database query performance
   - Email queue backlog

**Implementation:**
```sql
-- Email verification rate (7 hari terakhir)
SELECT 
  COUNT(*) FILTER (WHERE email_verified = true) AS verified,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email_verified = true) / COUNT(*), 2) AS rate
FROM Soundpub.profiles
WHERE created_at >= NOW() - INTERVAL '7 days';

-- Password reset requests (30 hari terakhir)
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS reset_requests
FROM Soundpub.auth_events
WHERE event_type = 'password_reset_requested'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🧪 TESTING STRATEGY

### 1. Unit Tests

**Frontend (Vitest + React Testing Library):**
```typescript
describe('ForgotPassword', () => {
  test('shows error for invalid email', async () => {
    render(<ForgotPassword />);
    const input = screen.getByLabelText('Email');
    const button = screen.getByText('Kirim Link Reset');
    
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('Email tidak valid')).toBeInTheDocument();
    });
  });
});
```

**Backend (Deno Test):**
```typescript
Deno.test('send-password-reset: rate limit enforcement', async () => {
  const email = 'test@example.com';
  
  // Send 3 requests
  for (let i = 0; i < 3; i++) {
    await sendPasswordReset(email);
  }
  
  // 4th request should fail
  const result = await sendPasswordReset(email);
  assertEquals(result.error, 'Rate limit exceeded');
});
```

---

### 2. Integration Tests

**Test Scenarios:**
1. Full signup → email verification → login flow
2. Password reset → change password → login dengan password baru
3. Resend verification → verify → access dashboard
4. Rate limiting: multiple requests → blocked
5. Token expiry: wait 25 hours → token invalid

---

### 3. E2E Tests (Playwright)

```typescript
test('password reset flow', async ({ page }) => {
  // 1. Go to login page
  await page.goto('/login');
  
  // 2. Click "Lupa Password"
  await page.click('text=Lupa Password?');
  
  // 3. Enter email
  await page.fill('input[type="email"]', 'test@example.com');
  await page.click('button:has-text("Kirim Link Reset")');
  
  // 4. Check success message
  await expect(page.locator('text=Email Terkirim')).toBeVisible();
  
  // 5. Simulate email link click
  const mockToken = 'test-token-123';
  await page.goto(`/reset-password?token=${mockToken}`);
  
  // 6. Enter new password
  await page.fill('input[placeholder="Password Baru"]', 'NewPass123!');
  await page.fill('input[placeholder="Konfirmasi Password"]', 'NewPass123!');
  await page.click('button:has-text("Reset Password")');
  
  // 7. Verify redirect to login
  await expect(page).toHaveURL('/login');
});
```

---

### 4. Security Testing

**Checklist:**
- ✅ Token brute-force protection (rate limiting)
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (sanitize HTML in emails)
- ✅ CSRF protection (Supabase handles this)
- ✅ Password strength validation (min 8 char, uppercase, lowercase, number)
- ✅ Email enumeration prevention (generic success message)
- ✅ Token timing attack prevention (constant-time comparison)

---

## 📱 USER EXPERIENCE CONSIDERATIONS

### 1. Email Copy Best Practices

**Subject Lines:**
- Keep it short (< 50 chars)
- Use emoji sparingly (🔐 ✅)
- Clear action required
- Avoid spam words (FREE, URGENT, !!!)

**Email Body:**
- Personalize dengan nama user
- Clear call-to-action button
- Explain why they received this email
- Provide plain-text link sebagai fallback
- Footer dengan contact info & unsubscribe

---

### 2. Error Messages

**User-Friendly:**
❌ Bad: "Token validation failed: Invalid UUID format"
✅ Good: "Link verifikasi tidak valid. Silakan minta link baru."

❌ Bad: "Database query error: relation does not exist"
✅ Good: "Terjadi kesalahan. Coba lagi nanti."

❌ Bad: "Rate limit exceeded: 3 attempts in 1 hour"
✅ Good: "Terlalu banyak percobaan. Coba lagi dalam 1 jam."

---

### 3. Loading States

**Always provide feedback:**
```typescript
// Loading button
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Memproses...
    </>
  ) : (
    'Kirim'
  )}
</Button>

// Page-level loading
{isVerifying && (
  <div className="flex flex-col items-center gap-4">
    <Loader2 className="h-8 w-8 animate-spin" />
    <p>Memverifikasi email Anda...</p>
  </div>
)}
```

---

### 4. Accessibility (A11Y)

**WCAG Compliance:**
- Form labels dengan `htmlFor`
- Error messages dengan `aria-describedby`
- Loading states dengan `aria-busy`
- Focus management (auto-focus password field)
- Keyboard navigation support
- Screen reader friendly messages

```typescript
<div>
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    aria-describedby={errors.email ? 'email-error' : undefined}
    aria-invalid={!!errors.email}
  />
  {errors.email && (
    <p id="email-error" className="text-destructive text-sm" role="alert">
      {errors.email}
    </p>
  )}
</div>
```

---

## 🚀 DEPLOYMENT PLAN

### Phase 1: Database Setup (Week 1)

1. ✅ Backup production database
2. ✅ Run migration scripts (`ALTER TABLE`, `CREATE TABLE`)
3. ✅ Create indexes
4. ✅ Setup RLS policies
5. ✅ Test queries di staging environment
6. ✅ Verify data integrity

**SQL Execution Order:**
```bash
# 1. Backup
pg_dump Soundpub > backup_$(date +%Y%m%d).sql

# 2. Run migrations
psql Soundpub < migrations/002_auth_verification.sql

# 3. Verify
psql Soundpub -c "SELECT column_name FROM information_schema.columns 
                  WHERE table_schema='Soundpub' AND table_name='profiles';"
```

---

### Phase 2: Backend Functions (Week 1-2)

1. ✅ Deploy edge functions ke staging
   ```bash
   supabase functions deploy send-password-reset --project-ref staging
   supabase functions deploy verify-password-reset-token
   supabase functions deploy reset-password
   supabase functions deploy send-verification-email
   supabase functions deploy verify-email
   ```

2. ✅ Update `send-app-email` dengan template baru
3. ✅ Test semua endpoints dengan Postman/Insomnia
4. ✅ Monitor logs & error rates
5. ✅ Deploy ke production

---

### Phase 3: Frontend Implementation (Week 2)

1. ✅ Create new pages (`ForgotPassword.tsx`, etc)
2. ✅ Update existing Auth.tsx
3. ✅ Update routes
4. ✅ Add email verification banner
5. ✅ Test di development
6. ✅ Build production bundle
   ```bash
   pnpm build
   ```
7. ✅ Deploy to production (Docker build)
   ```bash
   docker build -t Soundpub-dashboard:latest .
   docker-compose up -d
   ```

---

### Phase 4: Testing & QA (Week 2-3)

1. ✅ Manual testing semua flows
2. ✅ Cross-browser testing (Chrome, Firefox, Safari, Edge)
3. ✅ Mobile responsive testing
4. ✅ Email client testing (Gmail, Outlook, Yahoo)
5. ✅ Accessibility audit (Lighthouse, axe DevTools)
6. ✅ Security audit (OWASP checklist)
7. ✅ Performance testing (PageSpeed Insights)

---

### Phase 5: Monitoring & Iteration (Week 3-4)

1. ✅ Setup Sentry/LogRocket untuk error tracking
2. ✅ Configure alerts (Slack/Discord)
3. ✅ Monitor email delivery rates
4. ✅ Collect user feedback
5. ✅ Fix bugs & iterate
6. ✅ Documentation update

---

## 📈 SUCCESS METRICS (KPIs)

**Week 1:**
- ✅ Email verification rate: > 60%
- ✅ Password reset completion rate: > 70%
- ✅ Email delivery rate: > 95%
- ✅ Zero critical bugs

**Month 1:**
- ✅ Email verification rate: > 80%
- ✅ User complaints about locked accounts: < 5 per week
- ✅ False positive rate (spam folder): < 10%
- ✅ Average time to verify email: < 1 hour

**Month 3:**
- ✅ All new users verified within 48 hours
- ✅ Password reset NPS score: > 8/10
- ✅ Reduction in support tickets: 30%

---

## 🛠️ MAINTENANCE & OPERATIONS

### Daily Tasks
- Monitor email delivery rates
- Check rate limit abuse
- Review failed email logs

### Weekly Tasks
- Cleanup expired tokens (automated via cron)
  ```sql
  DELETE FROM Soundpub.profiles
  WHERE verification_token_expires_at < NOW() - INTERVAL '30 days';
  ```
- Review auth_events for patterns
- Update email templates if needed

### Monthly Tasks
- Security audit
- Performance review
- User feedback analysis
- Dependency updates

---

## 🔮 FUTURE ENHANCEMENTS

### Phase 2 Features (Nice to Have)

1. **Two-Factor Authentication (2FA)**
   - TOTP via authenticator apps
   - SMS backup codes
   - Recovery codes

2. **Social Login Expansion**
   - Facebook Login
   - Apple ID
   - GitHub (for developers)

3. **Password Policy Enforcement**
   - Password history (tidak bisa reuse 5 password terakhir)
   - Force password change every 90 hari (optional)
   - Breached password detection (HaveIBeenPwned API)

4. **Advanced Security**
   - Device fingerprinting
   - Geolocation-based alerts
   - Session management (view all active sessions)
   - Suspicious activity detection

5. **Email Deliverability Improvements**
   - Custom domain email (noreply@Soundpub.xyz)
   - DKIM, SPF, DMARC setup
   - Email reputation monitoring
   - Fallback provider (Resend, SendGrid)

6. **User Preferences**
   - Notification channels (email, push, SMS)
   - Language preferences (i18n)
   - Email frequency control
   - Digest mode (daily summary)

---

## 🆘 TROUBLESHOOTING

### Common Issues

**1. Email tidak terkirim**
- ✅ Check `email_send_log` table untuk error message
- ✅ Verify Gmail API credentials (`GOOGLE_MAIL_API_KEY`)
- ✅ Check spam folder
- ✅ Verify email syntax valid
- ✅ Check rate limits

**2. Token tidak valid**
- ✅ Check token expiry (`token_expires_at`)
- ✅ Verify token format (UUID)
- ✅ Check if token already used (cleared from DB)
- ✅ Verify URL tidak ter-truncate

**3. Rate limit false positive**
- ✅ Check `rate_limits` table
- ✅ Manual reset: `DELETE FROM Soundpub.rate_limits WHERE identifier = 'email@example.com';`
- ✅ Adjust limits in function code

**4. Email verification loop**
- ✅ Check `email_verified` column di profiles
- ✅ Verify `auth.users.confirmed_at` updated
- ✅ Clear browser cache
- ✅ Force refresh profile data

---

## 💡 KESIMPULAN

### Sistem Yang Direncanakan: Analisis Kelebihan & Kelemahan

#### ✅ KELEBIHAN SISTEM BARU

**1. Keamanan Terjamin**
- Password reset dengan token secure (crypto random)
- Rate limiting mencegah brute force
- Token expiry otomatis (24 jam reset, 7 hari verification)
- Audit trail lengkap untuk forensik
- One-time token usage

**2. User Experience Excellent**
- Self-service password reset (tidak perlu kontak admin)
- Email verification mencegah typo email
- Clear feedback di setiap step
- Responsive & accessible UI
- Multi-language ready (i18n framework)

**3. Scalable & Maintainable**
- Edge functions serverless (auto-scale)
- Database schema clean & normalized
- Email templates reusable
- Monitoring built-in
- Easy to extend (2FA, social login)

**4. Compliance Ready**
- GDPR compliant (user data control)
- Security audit trail
- Privacy-focused (opt-in email)
- Data retention policies
- Right to be forgotten support

**5. Cost Effective**
- Supabase self-hosted (no extra cost)
- Gmail API free tier sufficient
- Efficient database queries (indexed)
- Minimal server resources

---

#### ⚠️ KELEMAHAN & MITIGASI

**1. Email Deliverability**
- **Risk:** Email masuk spam, provider blocking
- **Mitigasi:**
  - Setup DKIM/SPF/DMARC
  - Monitor reputation scores
  - Fallback ke provider lain (Resend)
  - User education (cek spam folder)

**2. Token Management Complexity**
- **Risk:** Token collision, race condition
- **Mitigasi:**
  - UUID v4 (collision chance: 1 in 5.3×10^36)
  - Database constraints (UNIQUE)
  - Transaction locks untuk critical updates
  - Idempotency keys

**3. Rate Limiting False Positives**
- **Risk:** Legitimate users terblock (shared IP)
- **Mitigasi:**
  - Generous limits (3 per hour, bukan per 5 menit)
  - Manual override untuk admin
  - IP whitelist untuk trusted networks
  - User notification sebelum block

**4. User Friction**
- **Risk:** Extra step (verify email) bikin user abandon
- **Mitigasi:**
  - Instant email delivery (< 30 detik)
  - Allow partial access tanpa verification
  - Resend option mudah dijangkau
  - Clear benefit communication

**5. Dependency on Email Provider**
- **Risk:** Gmail API down, account suspended
- **Mitigasi:**
  - Multi-provider support (Gmail + Resend)
  - Queue system untuk retry
  - Fallback ke admin notification
  - Regular health checks

---

### PERBANDINGAN: SEKARANG vs NANTI

| Aspek | Sistem Sekarang | Sistem Baru |
|-------|----------------|-------------|
| **Password Reset** | ❌ Harus kontak admin | ✅ Self-service dalam 5 menit |
| **Email Verification** | ❌ Tidak ada | ✅ Otomatis + resend option |
| **Security** | ⚠️ Basic (Supabase default) | ✅ Multi-layer (rate limit, audit, expiry) |
| **User Support Load** | 🔴 Tinggi (banyak ticket) | 🟢 Rendah (automated) |
| **Spam Account** | 🔴 Mudah dibuat | 🟢 Sulit (butuh email valid) |
| **Compliance** | ⚠️ Partial | ✅ Full (GDPR ready) |
| **Monitoring** | ❌ Tidak ada | ✅ Comprehensive dashboard |
| **Cost** | 💰 Admin time mahal | 💰 Minimal (automation) |

---

### REKOMENDASI PRIORITAS

**Must Have (Phase 1):**
1. ✅ Password reset flow (highest priority)
2. ✅ Email verification saat signup
3. ✅ Rate limiting
4. ✅ Email templates
5. ✅ Basic monitoring

**Should Have (Phase 2):**
6. 🔶 Resend verification UI
7. 🔶 Security dashboard untuk admin
8. 🔶 Email delivery monitoring
9. 🔶 Advanced rate limiting (IP-based)
10. 🔶 Mobile-responsive optimization

**Nice to Have (Phase 3):**
11. 🔷 Two-factor authentication
12. 🔷 Social login expansion
13. 🔷 Password breach detection
14. 🔷 Custom email domain
15. 🔷 Multi-language support

---

### TIMELINE SUMMARY

```
Week 1: Database + Backend Functions
Week 2: Frontend Implementation
Week 3: Testing & QA
Week 4: Deployment + Monitoring
Week 5+: Iteration & Improvements
```

**Total Estimated Time:** 4-5 weeks (1 developer full-time)

**Budget Estimation:**
- Developer time: 160 hours @ $50/hour = $8,000
- Infrastructure: $0 (self-hosted)
- Email service: $0 (Gmail API free tier)
- **Total: ~$8,000**

---

### NEXT STEPS

**Immediate Actions:**
1. ✅ Review & approve this document
2. ✅ Setup staging environment
3. ✅ Create GitHub issues/tickets
4. ✅ Assign developer resources
5. ✅ Schedule kickoff meeting

**Decision Points:**
- [ ] Approve rate limiting values (3/hour ok?)
- [ ] Confirm token expiry times (24h reset, 7d verify ok?)
- [ ] Choose email sender name/address
- [ ] Decide: force email verification or optional?
- [ ] Budget approval for future enhancements (2FA, etc)

---

## 📝 CATATAN PENTING UNTUK TIM

> **INGAT:** Kamu menggunakan **Supabase self-hosted** dengan schema `Soundpub`.
> Semua query harus eksplisit menggunakan `Soundpub.table_name`, bukan `public.table_name`.

**Environment Variables to Set:**
```bash
# Edge functions
SUPABASE_URL=https://supabase.carubra.com
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
DATABASE_SCHEMA=Soundpub

# Email
LOVABLE_API_KEY=<from_lovable>
GOOGLE_MAIL_API_KEY=<from_google_connector>

# Optional
RESEND_API_KEY=<fallback_email_provider>
```

**Database Connection:**
```typescript
// Selalu gunakan schema Soundpub
const supabase = createClient(url, key, {
  db: { schema: 'Soundpub' }
});
```

**Testing Accounts:**
```
# Staging
test+reset@Soundpub.xyz
test+verify@Soundpub.xyz

# Production (hati-hati!)
Gunakan email pribadi untuk testing awal
```

---

## ✅ SIGN-OFF

**Document Version:** 1.0  
**Created:** 2026-08-14  
**Last Updated:** 2026-08-14  
**Author:** Kiro AI + Development Team  
**Status:** 🟡 Awaiting Approval  

**Approval Required:**
- [ ] Tech Lead / CTO
- [ ] Product Manager
- [ ] Security Officer
- [ ] DevOps Lead

**Questions?** Contact: dev@Soundpub.xyz

---

🎵 **Soundpub - Empowering Musicians, Securing Accounts** 🎵

---

## 📚 LAMPIRAN

### A. SQL Migration Script Lengkap

File: `migrations/002_auth_verification.sql`

```sql
-- =====================================================
-- AUTH VERIFICATION SYSTEM MIGRATION
-- =====================================================
-- Schema: Soundpub
-- Created: 2026-08-14
-- Purpose: Add password reset & email verification

BEGIN;

-- 1. Add columns to profiles
ALTER TABLE Soundpub.profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_verification_token 
  ON Soundpub.profiles(verification_token) 
  WHERE verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_password_reset_token 
  ON Soundpub.profiles(password_reset_token) 
  WHERE password_reset_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_verified 
  ON Soundpub.profiles(email_verified);

-- 3. Create auth_events table
CREATE TABLE IF NOT EXISTS Soundpub.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_events_user_id ON Soundpub.auth_events(user_id);
CREATE INDEX idx_auth_events_type ON Soundpub.auth_events(event_type);
CREATE INDEX idx_auth_events_created_at ON Soundpub.auth_events(created_at DESC);

-- 4. Create rate_limits table
CREATE TABLE IF NOT EXISTS Soundpub.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  action_type TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  UNIQUE(identifier, action_type)
);

CREATE INDEX idx_rate_limits_identifier ON Soundpub.rate_limits(identifier, action_type);
CREATE INDEX idx_rate_limits_blocked ON Soundpub.rate_limits(blocked_until) 
  WHERE blocked_until IS NOT NULL;

-- 5. Enable RLS
ALTER TABLE Soundpub.auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.rate_limits ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
CREATE POLICY "Users can view own auth events"
  ON Soundpub.auth_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service can insert auth events"
  ON Soundpub.auth_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view rate limits"
  ON Soundpub.rate_limits FOR SELECT
  TO authenticated
  USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Service can manage rate limits"
  ON Soundpub.rate_limits FOR ALL
  TO authenticated
  WITH CHECK (true);

-- 7. Create cleanup function
CREATE OR REPLACE FUNCTION Soundpub.cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM Soundpub.rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create cleanup function for expired tokens
CREATE OR REPLACE FUNCTION Soundpub.cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  UPDATE Soundpub.profiles
  SET 
    verification_token = NULL,
    verification_token_expires_at = NULL
  WHERE verification_token_expires_at < NOW();
  
  UPDATE Soundpub.profiles
  SET 
    password_reset_token = NULL,
    password_reset_token_expires_at = NULL
  WHERE password_reset_token_expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
END $$;
```

---

### B. Environment Variables Checklist

```bash
# Required for Edge Functions
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_SCHEMA=Soundpub

# Email Provider
LOVABLE_API_KEY=
GOOGLE_MAIL_API_KEY=

# Optional
RESEND_API_KEY=
APP_URL=https://dashboard.Soundpub.xyz

# Monitoring (Optional)
SENTRY_DSN=
LOGROCKET_APP_ID=
```

---

### C. API Endpoints Reference

**1. Send Password Reset**
```
POST /functions/v1/send-password-reset
Body: { "email": "user@example.com" }
Response: { "success": true, "message": "Email sent" }
```

**2. Verify Reset Token**
```
POST /functions/v1/verify-password-reset-token
Body: { "token": "uuid-token" }
Response: { "valid": true, "userId": "uuid", "email": "user@example.com" }
```

**3. Reset Password**
```
POST /functions/v1/reset-password
Body: { "token": "uuid-token", "newPassword": "NewPass123!" }
Response: { "success": true, "message": "Password reset successful" }
```

**4. Send Verification Email**
```
POST /functions/v1/send-verification-email
Body: { "userId": "uuid", "email": "user@example.com", "isResend": false }
Response: { "success": true, "message": "Verification email sent" }
```

**5. Verify Email**
```
POST /functions/v1/verify-email
Body: { "token": "uuid-token" }
Response: { "success": true, "message": "Email verified", "redirectTo": "/dashboard" }
```

---

### D. Monitoring Queries

```sql
-- 1. Email verification stats (last 30 days)
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS total_signups,
  COUNT(*) FILTER (WHERE email_verified = true) AS verified,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email_verified = true) / COUNT(*), 2) AS verification_rate
FROM Soundpub.profiles
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 2. Password reset activity
SELECT 
  event_type,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users
FROM Soundpub.auth_events
WHERE event_type IN ('password_reset_requested', 'password_reset_completed')
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_type;

-- 3. Rate limit violations
SELECT 
  identifier,
  action_type,
  attempt_count,
  blocked_until,
  last_attempt_at
FROM Soundpub.rate_limits
WHERE blocked_until > NOW()
ORDER BY last_attempt_at DESC;

-- 4. Failed verifications
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS failed_attempts
FROM Soundpub.auth_events
WHERE event_type = 'email_verification_failed'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

**END OF DOCUMENT**
