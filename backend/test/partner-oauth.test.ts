import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartnerOAuthService } from '../src/auth/partner-oauth.js';

test('partner OAuth transaction binds browser state, PKCE, redirect, expiry and replay', async () => {
  let now = 1_800_000_000_000;
  const exchanges: Array<{ code: string; redirectUri: string; codeVerifier: string }> = [];
  const service = createPartnerOAuthService({
    createAuthorizationUrl(input, origins) {
      const redirect = new URL(input.redirectUri);
      if (!origins.includes(redirect.origin) || redirect.pathname !== '/auth') return null;
      const url = new URL('https://sso.example.test/realms/partner/protocol/openid-connect/auth');
      url.searchParams.set('state', input.state);
      url.searchParams.set('code_challenge', input.codeChallenge);
      return url.href;
    },
    async exchangeAuthorizationCode(input) {
      exchanges.push(input);
      return { issuer: 'https://sso.example.test/realms/partner', subject: 'partner-user' };
    },
  }, { secret: 'synthetic-partner-transaction-secret-32-chars',
    allowedRedirectOrigins: ['http://127.0.0.1:8281'], now: () => now });

  assert.equal(service.start('http://example.invalid/auth'), null);
  const started = service.start('http://127.0.0.1:8281/auth');
  assert.ok(started);
  const state = new URL(started.authorizationUrl).searchParams.get('state')!;
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await service.exchange({ code: 'authorization-code', state: 'x'.repeat(43),
    transaction: started.transaction }), null);
  assert.deepEqual(await service.exchange({ code: 'authorization-code', state, transaction: started.transaction }),
    { issuer: 'https://sso.example.test/realms/partner', subject: 'partner-user' });
  assert.equal(exchanges[0]?.redirectUri, 'http://127.0.0.1:8281/auth');
  assert.match(exchanges[0]?.codeVerifier ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await service.exchange({ code: 'authorization-code', state, transaction: started.transaction }), null);
  assert.equal(await service.exchange({ code: 'authorization-code', state,
    transaction: `${started.transaction.slice(0, -1)}x` }), null);

  const expired = service.start('http://127.0.0.1:8281/auth')!;
  now += 10 * 60 * 1000 + 1;
  assert.equal(await service.exchange({ code: 'authorization-code',
    state: new URL(expired.authorizationUrl).searchParams.get('state')!, transaction: expired.transaction }), null);
});
