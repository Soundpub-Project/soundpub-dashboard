const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/auth.ts', 'utf8');
const forgot = fs.readFileSync('src/pages/ForgotPassword.tsx', 'utf8');
const reset = fs.readFileSync('src/pages/ResetPassword.tsx', 'utf8');
const verify = fs.readFileSync('src/pages/VerifyEmail.tsx', 'utf8');
const required = fs.readFileSync('src/pages/VerifyEmailRequired.tsx', 'utf8');
const compose = fs.readFileSync('backend/docker-compose.yml', 'utf8');
const authProvider = fs.readFileSync('src/hooks/useAuth.tsx', 'utf8');
const ssoProvider = fs.readFileSync('src/context/SsoAuthContext.tsx', 'utf8');
const authPage = fs.readFileSync('src/pages/Auth.tsx', 'utf8');
const forgotPage = fs.readFileSync('src/pages/ForgotPassword.tsx', 'utf8');
const resetPage = fs.readFileSync('src/pages/ResetPassword.tsx', 'utf8');

for (const operation of [
  'requestEmailVerification', 'confirmEmailVerification', 'requestPasswordRecovery', 'resetRecoveredPassword',
]) assert.match(api, new RegExp(`${operation}:`));
assert.match(forgot, /usesBackendDomain\('auth'\)[\s\S]*authApi\.requestPasswordRecovery/);
assert.match(reset, /usesBackendDomain\('auth'\)[\s\S]*authApi\.resetRecoveredPassword/);
assert.match(verify, /usesBackendDomain\('auth'\)[\s\S]*authApi\.confirmEmailVerification/);
assert.match(required, /usesBackendDomain\('auth'\)[\s\S]*authApi\.requestEmailVerification/);
assert.match(compose, /VITE_SOUNDPUB_BACKEND_DOMAINS: auth,/);
assert.match(authProvider, /if \(usesBackendDomain\('auth'\)\) \{[\s\S]*authApi\.session\(\)[\s\S]*return \(\) =>/);
assert.match(authProvider, /if \(!usesBackendDomain\('auth'\)\) await supabase\.auth\.signOut\(\)/);
assert.match(ssoProvider, /if \(usesBackendDomain\('auth'\)\) \{[\s\S]*backendPartnerSsoEnabled[\s\S]*authApi\.partnerLogin/);
assert.match(ssoProvider, /Login partner SSO belum dikonfigurasi di environment ini/);
assert.match(ssoProvider, /if \(exchangedRef\.current\) return;\s*exchangedRef\.current = true;/);
assert.match(ssoProvider, /window\.history\.replaceState\(\{\}, '', window\.location\.pathname\);\s*const ok = await exchangeToken\(\{ code: callback\.code, state: callback\.state \}\)/);
assert.match(ssoProvider, /await authApi\.logout\(\);[\s\S]*if \(shouldLogoutRealm\) keycloakLogout\(\);[\s\S]*else navigate\('\/auth'/);
assert.match(ssoProvider, /if \(!backendPartnerSsoEnabled\) \{[\s\S]*window\.history\.replaceState/);
assert.match(api, /partnerStart: \(redirectUri: string\)/);
assert.match(api, /partnerLogin: \(code: string, state: string\)/);
assert.match(ssoProvider, /authApi\.partnerStart\(`\$\{window\.location\.origin\}\/auth`\)/);
assert.match(compose, /VITE_PARTNER_SSO_ENABLED: 'false'/);
assert.match(fs.readFileSync('Dockerfile', 'utf8'), /ARG VITE_PARTNER_SSO_ENABLED=false[\s\S]*ENV VITE_PARTNER_SSO_ENABLED=/);
assert.match(authPage, /handleGoogleSignIn = async \(\) => \{\s*if \(usesBackendDomain\('auth'\)\)/);
assert.match(authPage, /Login Google belum tersedia/);
for (const page of [authPage, forgotPage, resetPage]) {
  assert.doesNotMatch(page, /\b(?:err|error)\.errors\b/);
  assert.match(page, /\b(?:err|error)\.issues\b/);
}
console.log('local auth lifecycle frontend contract passed');
