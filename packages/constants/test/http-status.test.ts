import assert from 'node:assert/strict';
import { STATUS_CODES } from 'node:http';
import { test } from 'node:test';

import { HttpStatus } from '../src/http-status.ts';

void test('every value is a status code that Node knows', () => {
  for (const [name, code] of Object.entries(HttpStatus)) {
    assert.ok(STATUS_CODES[code], `${name} = ${String(code)} is not in http.STATUS_CODES`);
  }
});

void test('every value is unique', () => {
  const values = Object.values(HttpStatus);

  assert.equal(new Set(values).size, values.length);
});

void test('has the common codes under their usual names', () => {
  assert.equal(HttpStatus.Ok, 200);
  assert.equal(HttpStatus.NoContent, 204);
  assert.equal(HttpStatus.BadRequest, 400);
  assert.equal(HttpStatus.NotFound, 404);
  assert.equal(HttpStatus.InternalServerError, 500);
});
