# 🔌 API DOCUMENTATION - Auth Verification System
**SoundPub Dashboard Edge Functions**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
6. [Code Examples](#code-examples)
7. [Testing](#testing)

---

## 🎯 Overview

Base URL (Production): `https://supabase.carubra.com/functions/v1`  
Base URL (Staging): `https://staging.supabase.carubra.com/functions/v1`

**Content-Type:** `application/json`  
**Authentication:** Bearer token (Supabase anon key)

### Common Headers
```http
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>
apikey: <SUPABASE_ANON_KEY>
```

---

## 🔐 Authentication

Most endpoints are public (no JWT verification) but require the Supabase anon key:

```typescript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'apikey': SUPABASE_ANON_KEY
};
```

---

## ⚠️ Error Handling

### Standard Error Response

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_EMAIL` | 400 | Email format invalid |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `TOKEN_INVALID` | 401 | Token not found or invalid |
| `USER_NOT_FOUND` | 404 | User does not exist |
| `WEAK_PASSWORD` | 400 | Password too weak |
| `PASSWORD_MISMATCH` | 400 | Passwords don't match |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 🚦 Rate Limiting

### Limits

| Action | Limit | Window | Blocked Duration |
|--------|-------|--------|------------------|
| Password Reset | 3 requests | 1 hour | 1 hour |
| Email Verification | 5 requests | 1 hour | 1 hour |
| Login Attempts | 5 attempts | 15 minutes | 30 minutes |

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after_seconds": 3600,
  "attempt_count": 4,
  "max_attempts": 3
}
```

---

## 📡 API Endpoints

### 1. Send Password Reset

**Endpoint:** `POST /send-password-reset`

**Description:** Sends password reset email to user.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "If this email exists, a reset link has been sent"
}
```

**Note:** Always returns success for security (prevents email enumeration)

**Example:**
```typescript
const response = await fetch(`${BASE_URL}/send-password-reset`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email: 'user@example.com' })
});

const data = await response.json();
console.log(data.message);
```

---

### 2. Verify Password Reset Token

**Endpoint:** `POST /verify-password-reset-token`

**Description:** Validates password reset token.

**Request Body:**
```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (200):**
```json
{
  "valid": true,
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "expiresAt": "2026-08-15T12:00:00.000Z"
}
```

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Token expired or invalid",
  "code": "TOKEN_INVALID"
}
```

**Example:**
```typescript
const response = await fetch(`${BASE_URL}/verify-password-reset-token`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ token: tokenFromUrl })
});

const data = await response.json();
if (data.valid) {
  // Show reset password form
} else {
  // Show error message
}
```

---

### 3. Reset Password

**Endpoint:** `POST /reset-password`

**Description:** Resets user password with valid token.

**Request Body:**
```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "newPassword": "NewSecurePass123!"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (optional but recommended)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Password must be at least 8 characters",
  "code": "WEAK_PASSWORD"
}
```

**Example:**
```typescript
const response = await fetch(`${BASE_URL}/reset-password`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ 
    token: tokenFromUrl,
    newPassword: 'NewSecurePass123!'
  })
});

const data = await response.json();
if (data.success) {
  // Redirect to login
} else {
  // Show error
}
```

---

### 4. Send Verification Email

**Endpoint:** `POST /send-verification-email`

**Description:** Sends email verification link to user.

**Request Body:**
```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "isResend": false
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Error Response (429):**
```json
{
  "success": false,
  "error": "Too many verification emails sent",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after_seconds": 3600
}
```

**Example:**
```typescript
// After signup
const { data: { user } } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
});

// Send verification email
await fetch(`${BASE_URL}/send-verification-email`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    userId: user.id,
    email: user.email,
    isResend: false
  })
});
```

---

### 5. Verify Email

**Endpoint:** `POST /verify-email`

**Description:** Verifies user email with token from link.

**Request Body:**
```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "redirectTo": "/dashboard"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Verification link expired",
  "code": "TOKEN_EXPIRED"
}
```

**Example:**
```typescript
// Get token from URL: /verify-email?token=xxx
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

const response = await fetch(`${BASE_URL}/verify-email`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ token })
});

const data = await response.json();
if (data.success) {
  // Redirect to dashboard
  window.location.href = data.redirectTo;
} else {
  // Show error + resend option
}
```

---

## 💻 Code Examples

### Frontend Integration

#### React Hook for Password Reset

```typescript
// hooks/usePasswordReset.ts
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePasswordReset() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = async (email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        'send-password-reset',
        { body: { email } }
      );

      if (error) throw error;
      return { success: true, data };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        'reset-password',
        { body: { token, newPassword } }
      );

      if (error) throw error;
      return { success: true, data };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  };

  return { requestReset, resetPassword, isLoading, error };
}
```

#### Usage in Component

```tsx
// pages/ForgotPassword.tsx
import { useState } from 'react';
import { usePasswordReset } from '@/hooks/usePasswordReset';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const { requestReset, isLoading, error } = usePasswordReset();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await requestReset(email);
    if (result.success) {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div>
        <h2>Email Sent!</h2>
        <p>Check your inbox for reset instructions.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        required
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send Reset Link'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

---

### Backend Function Template

#### send-password-reset/index.ts

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const getDatabaseSchema = () => 
  Deno.env.get('DATABASE_SCHEMA') || 'soundpub';

const createSoundpubClient = (url: string, key: string) => {
  return createClient(url, key, {
    db: { schema: getDatabaseSchema() },
  });
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createSoundpubClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { email } = await req.json();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const rateLimitResult = await supabase.rpc('check_rate_limit', {
      p_identifier: email,
      p_action_type: 'password_reset',
      p_max_attempts: 3,
      p_window_minutes: 60
    });

    if (!rateLimitResult.data?.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after_seconds: rateLimitResult.data?.retry_after_seconds || 3600,
          attempt_count: rateLimitResult.data?.attempt_count,
          max_attempts: rateLimitResult.data?.max_attempts
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email)
      .maybeSingle();

    // Always return success (security: prevent email enumeration)
    if (!profile) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'If this email exists, a reset link has been sent'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update profile with token
    await supabase
      .from('profiles')
      .update({
        password_reset_token: token,
        password_reset_token_expires_at: expiresAt.toISOString(),
        password_reset_sent_at: new Date().toISOString()
      })
      .eq('id', profile.id);

    // Send email
    const appUrl = Deno.env.get('APP_URL') || 'https://dashboard.soundpub.xyz';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await supabase.functions.invoke('send-app-email', {
      body: {
        templateName: 'password-reset',
        recipientUserId: profile.id,
        templateData: { resetUrl }
      }
    });

    // Log event
    await supabase.from('auth_events').insert({
      user_id: profile.id,
      event_type: 'password_reset_requested',
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      metadata: { email }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'If this email exists, a reset link has been sent'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('send-password-reset error:', err);
    return new Response(
      JSON.stringify({ 
        error: err.message || 'Internal server error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 🧪 Testing

### cURL Examples

#### Test Password Reset Request

```bash
curl -X POST https://supabase.carubra.com/functions/v1/send-password-reset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"email":"test@example.com"}'
```

#### Test Token Verification

```bash
curl -X POST https://supabase.carubra.com/functions/v1/verify-password-reset-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"token":"550e8400-e29b-41d4-a716-446655440000"}'
```

#### Test Password Reset

```bash
curl -X POST https://supabase.carubra.com/functions/v1/reset-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "token":"550e8400-e29b-41d4-a716-446655440000",
    "newPassword":"NewSecurePass123!"
  }'
```

### Postman Collection

Import this JSON into Postman:

```json
{
  "info": {
    "name": "SoundPub Auth Verification",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://supabase.carubra.com/functions/v1"
    },
    {
      "key": "anon_key",
      "value": "YOUR_ANON_KEY_HERE"
    }
  ],
  "item": [
    {
      "name": "Send Password Reset",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "Authorization",
            "value": "Bearer {{anon_key}}"
          },
          {
            "key": "apikey",
            "value": "{{anon_key}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\"\n}"
        },
        "url": {
          "raw": "{{base_url}}/send-password-reset",
          "host": ["{{base_url}}"],
          "path": ["send-password-reset"]
        }
      }
    }
  ]
}
```

---

## 📞 Support

**Questions?** dev@soundpub.xyz  
**Documentation:** `/docs/RANCANGAN_AUTH_VERIFICATION.md`  
**Bug Reports:** GitHub Issues

---

**Last Updated:** 2026-08-14  
**Version:** 1.0  
**Maintained By:** SoundPub Development Team

🎵 **SoundPub - Empowering Musicians, Securing Accounts** 🎵
