const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/auth.ts', 'utf8');
const forgot = fs.readFileSync('src/pages/ForgotPassword.tsx', 'utf8');
const reset = fs.readFileSync('src/pages/ResetPassword.tsx', 'utf8');
const verify = fs.readFileSync('src/pages/VerifyEmail.tsx', 'utf8');
const required = fs.readFileSync('src/pages/VerifyEmailRequired.tsx', 'utf8');
const compose = fs.readFileSync('backend/docker-compose.yml', 'utf8');

for (const operation of [
  'requestEmailVerification', 'confirmEmailVerification', 'requestPasswordRecovery', 'resetRecoveredPassword',
]) assert.match(api, new RegExp(`${operation}:`));
assert.match(forgot, /usesBackendDomain\('auth'\)[\s\S]*authApi\.requestPasswordRecovery/);
assert.match(reset, /usesBackendDomain\('auth'\)[\s\S]*authApi\.resetRecoveredPassword/);
assert.match(verify, /usesBackendDomain\('auth'\)[\s\S]*authApi\.confirmEmailVerification/);
assert.match(required, /usesBackendDomain\('auth'\)[\s\S]*authApi\.requestEmailVerification/);
assert.match(compose, /VITE_SOUNDPUB_BACKEND_DOMAINS: auth,/);
console.log('local auth lifecycle frontend contract passed');
