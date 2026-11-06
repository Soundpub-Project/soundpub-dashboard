import assert from 'node:assert/strict';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const resolver = zodResolver(z.object({ email: z.email() }));
const options = { criteriaMode: 'firstError', shouldUseNativeValidation: false, fields: {} };
const invalid = await resolver({ email: 'invalid' }, {}, options);
assert.ok(invalid.errors.email?.message);
const valid = await resolver({ email: 'ok@example.test' }, {}, options);
assert.equal(valid.values.email, 'ok@example.test');

const error = z.object({ email: z.email() }).safeParse({ email: 'invalid' }).error;
assert.ok(error?.issues[0]?.message);
console.log('Zod 4 form resolver and validation error contract passed');
