import assert from 'node:assert/strict';
import { test } from 'node:test';

import { z } from 'zod';

import { statusEntries } from '../src/responses.ts';
import { ValidationErrorResponse } from '../src/validation-error.ts';

void test('ValidationErrorResponse accepts real zod issues and keeps their extra fields', () => {
  const failure = z.object({ a: z.number() }).safeParse({ a: 'x' });
  assert.ok(!failure.success);
  const { issues } = failure.error;

  const parsed = ValidationErrorResponse.parse({ issues });

  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0]?.code, 'invalid_type');
  assert.deepEqual(parsed.issues[0]?.path, ['a']);
  assert.equal(parsed.issues[0]?.expected, 'number');
});

void test('ValidationErrorResponse rejects a body without issues', () => {
  assert.equal(ValidationErrorResponse.safeParse({}).success, false);
});

void test('statusEntries returns numeric statuses with their schemas', () => {
  const ok = z.string();
  const missing = z.undefined();

  assert.deepEqual(statusEntries({ 200: ok, 404: missing }), [
    [200, ok],
    [404, missing],
  ]);
});
