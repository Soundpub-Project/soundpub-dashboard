import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPartnerOAuthService, createPgPartnerOAuthReplayStore } from '../src/auth/partner-oauth.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration = dockerTestsEnabled ? test : test.skip;

integration('partner OAuth replay claim is shared, atomic, expiring and stores no raw state', async () => {
  const database = await concurrencyPostgres();
  try {
    await database.owner.query(`INSERT INTO soundpub.partner_oauth_replays(state_sha256,created_at,expires_at)
      VALUES ($1,clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '10 minutes')`, ['0'.repeat(64)]);
    let exchanges = 0;
    const provider = {
      createAuthorizationUrl(input: { redirectUri: string; state: string; codeChallenge: string }) {
        const url = new URL('https://sso.example.test/realms/partner/protocol/openid-connect/auth');
        url.searchParams.set('state', input.state);
        url.searchParams.set('code_challenge', input.codeChallenge);
        return url.href;
      },
      async exchangeAuthorizationCode() {
        exchanges++;
        return { issuer: 'https://sso.example.test/realms/partner', subject: 'shared-replay-user' };
      },
    };
    const options = { secret: 'synthetic-shared-replay-secret-32-characters',
      allowedRedirectOrigins: ['http://127.0.0.1:8281'], replayStore: createPgPartnerOAuthReplayStore(database.runtime) };
    const first = createPartnerOAuthService(provider, options);
    const second = createPartnerOAuthService(provider, { ...options,
      replayStore: createPgPartnerOAuthReplayStore(database.runtime) });
    const started = first.start('http://127.0.0.1:8281/auth')!;
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    const results = await Promise.all([
      first.exchange({ code: 'authorization-code-one', state, transaction: started.transaction }),
      second.exchange({ code: 'authorization-code-two', state, transaction: started.transaction }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(exchanges, 1);
    const stored = (await database.owner.query('SELECT state_sha256 FROM soundpub.partner_oauth_replays')).rows;
    assert.deepEqual(stored, [{ state_sha256: createHash('sha256').update(state, 'ascii').digest('hex') }]);
    assert.ok(!JSON.stringify(stored).includes(state));
  } finally { await database.close(); }
});
