/* eslint-disable @typescript-eslint/require-await -- handlers must return a Promise and the test handlers have nothing to await */
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { test } from 'node:test';

import { HttpStatus } from '@konvoulgaris/soong-constants';
import { logger } from '@konvoulgaris/soong-utils';
import { z } from 'zod';

import { declareResponses } from '../src/create-routes.ts';
import { createHandle } from '../src/pipeline.ts';
import { route } from '../src/route.ts';
import type { AnyPreOperationMiddleware, AnyRoute, RawRequest } from '../src/types.ts';

function noop(): undefined {
  return;
}

function stubLogger(t: TestContext): {
  warn: ReturnType<typeof t.mock.method>;
  error: ReturnType<typeof t.mock.method>;
} {
  return {
    warn: t.mock.method(logger, 'warn', noop),
    error: t.mock.method(logger, 'error', noop),
  };
}

function raw(overrides: Partial<RawRequest> = {}): RawRequest {
  return {
    method: 'GET',
    path: '/',
    headers: {},
    query: {},
    params: {},
    body: undefined,
    ...overrides,
  };
}

function handleFor(definition: AnyRoute): ReturnType<typeof createHandle> {
  return createHandle('testOperation', definition, declareResponses('testOperation', definition));
}

const Ok = z.object({ id: z.string() });
const Forbidden = z.object({ key: z.literal('FORBIDDEN') });
const IdParameters = z.object({ id: z.string() });
const LongIdParameters = z.object({ id: z.string().min(3) });
const NameBody = z.object({ name: z.string() });
const LimitQuery = z.object({ limit: z.coerce.number().default(10) });
const TenantHeaders = z.object({ 'x-tenant': z.string() });

function recording(calls: string[], name: string): AnyPreOperationMiddleware {
  return {
    responses: {},
    run: async (): Promise<undefined> => {
      calls.push(name);

      return undefined;
    },
  };
}

void test('runs the middlewares in order and stops at the first response', async (t) => {
  stubLogger(t);
  const calls: string[] = [];
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      request: { params: IdParameters },
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        recording(calls, 'first'),
        {
          responses: { [HttpStatus.Forbidden]: Forbidden },
          run: async (): Promise<{ status: 403; body: { key: 'FORBIDDEN' } }> => {
            calls.push('second');

            return { status: HttpStatus.Forbidden, body: { key: 'FORBIDDEN' } };
          },
        },
        recording(calls, 'third'),
      ],
      handler: async () => {
        calls.push('handler');

        return { status: HttpStatus.Ok, body: { id: '1' } };
      },
    }),
  );

  // The params are invalid on purpose. The middleware answers before validation.
  const response = await handle(raw({ params: {} }));

  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(response, { status: 403, body: { key: 'FORBIDDEN' } });
});

void test('collects the issues of all targets into one 400 and logs them', async (t) => {
  const { warn } = stubLogger(t);
  let isCalled = false;
  const handle = handleFor(
    route({
      method: 'post',
      path: '/x/{id}',
      request: {
        params: LongIdParameters,
        body: NameBody,
      },
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => {
        isCalled = true;

        return { status: HttpStatus.Ok, body: { id: '1' } };
      },
    }),
  );

  const response = await handle(raw({ params: { id: 'a' }, body: {} }));

  assert.equal(isCalled, false);
  assert.equal(response.status, 400);
  const paths = (response.body as { issues: { path: unknown[] }[] }).issues.map(
    (issue) => issue.path,
  );
  assert.deepEqual(paths, [['id'], ['name']]);
  assert.equal(warn.mock.callCount(), 1);
  const logged = warn.mock.calls[0]?.arguments[0] as {
    key: string;
    operationId: string;
    issues: unknown[];
  };
  assert.equal(logged.key, 'REQUEST_VALIDATION_FAILED');
  assert.equal(logged.operationId, 'testOperation');
  assert.equal(logged.issues.length, 2);
});

void test('passes parsed values, with defaults and coercion, to the handler', async (t) => {
  stubLogger(t);
  let received: unknown;
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x/{id}',
      request: {
        params: IdParameters,
        query: LimitQuery,
      },
      responses: { [HttpStatus.Ok]: Ok },
      handler: async (request) => {
        received = request;

        return { status: HttpStatus.Ok, body: { id: request.params.id } };
      },
    }),
  );

  const response = await handle(raw({ params: { id: '7' }, query: { limit: '3' } }));
  const withDefault = await handle(raw({ params: { id: '7' }, query: {} }));

  assert.deepEqual(response, { status: 200, body: { id: '7' } });
  assert.deepEqual(received, { params: { id: '7' }, query: { limit: 10 } });
  assert.equal(withDefault.status, 200);
});

void test('strips unknown keys from the response body', async (t) => {
  stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => ({ status: HttpStatus.Ok, body: { id: '1', passwordHash: 'secret' } }),
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 200, body: { id: '1' } });
});

void test('returns an empty 500 and logs when the body does not match its schema', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => ({ status: HttpStatus.Ok, body: { id: 1 } }) as never,
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 500, body: undefined });
  assert.equal(error.mock.callCount(), 1);
  const logged = error.mock.calls[0]?.arguments[0] as {
    key: string;
    reason: string;
    operationId: string;
    status: number;
    issues: unknown[];
  };
  assert.equal(logged.key, 'RESPONSE_VALIDATION_FAILED');
  assert.equal(logged.reason, 'invalid_body');
  assert.equal(logged.operationId, 'testOperation');
  assert.equal(logged.status, 200);
  assert.equal(logged.issues.length, 1);
});

void test('returns an empty 500 and logs when the handler returns an undeclared status', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => ({ status: HttpStatus.NotFound, body: {} }) as never,
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 500, body: undefined });
  const logged = error.mock.calls[0]?.arguments[0] as {
    key: string;
    reason: string;
    operationId: string;
    issues: unknown[];
  };
  assert.equal(logged.key, 'RESPONSE_VALIDATION_FAILED');
  assert.equal(logged.reason, 'undeclared_status');
  assert.equal(logged.operationId, 'testOperation');
  assert.deepEqual(logged.issues, []);
});

void test('returns a no-content response as it is', async (t) => {
  stubLogger(t);
  const handle = handleFor(
    route({
      method: 'delete',
      path: '/x',
      responses: { [HttpStatus.NoContent]: z.undefined() },
      handler: async () => ({ status: HttpStatus.NoContent, body: undefined }),
    }),
  );

  assert.deepEqual(await handle(raw()), { status: 204, body: undefined });
});

void test('returns an empty 500 when a middleware answers with an undeclared status', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        {
          responses: {},
          run: async (): Promise<{ status: 403; body: object }> => ({
            status: HttpStatus.Forbidden,
            body: {},
          }),
        },
      ],
      handler: async () => ({ status: HttpStatus.Ok, body: { id: '1' } }),
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 500, body: undefined });
  assert.equal(error.mock.callCount(), 1);
  assert.equal(
    (error.mock.calls[0]?.arguments[0] as { key: string }).key,
    'RESPONSE_VALIDATION_FAILED',
  );
});

void test('returns an empty 500 when a middleware response does not match its schema', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        {
          responses: { [HttpStatus.Forbidden]: Forbidden },
          run: async (): Promise<{ status: 403; body: { key: string } }> => ({
            status: HttpStatus.Forbidden,
            body: { key: 'WRONG' },
          }),
        },
      ],
      handler: async () => ({ status: HttpStatus.Ok, body: { id: '1' } }),
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 500, body: undefined });
  assert.equal(error.mock.callCount(), 1);
  assert.equal(
    (error.mock.calls[0]?.arguments[0] as { key: string }).key,
    'RESPONSE_VALIDATION_FAILED',
  );
});

void test('the handler may not return a status that only a middleware declares', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        {
          responses: { [HttpStatus.Forbidden]: Forbidden },
          run: async (): Promise<undefined> => undefined,
        },
      ],
      handler: async () => ({ status: HttpStatus.Forbidden, body: { key: 'FORBIDDEN' } }) as never,
    }),
  );

  const response = await handle(raw());

  assert.deepEqual(response, { status: 500, body: undefined });
  assert.equal(error.mock.callCount(), 1);
});

void test('does not catch an exception of the handler', async (t) => {
  const { error } = stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => {
        throw new Error('boom');
      },
    }),
  );

  await assert.rejects(handle(raw()), /boom/);
  assert.equal(error.mock.callCount(), 0);
});

void test('does not catch an exception of a middleware', async (t) => {
  stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        {
          responses: {},
          run: async (): Promise<undefined> => {
            throw new Error('middleware boom');
          },
        },
      ],
      handler: async () => ({ status: HttpStatus.Ok, body: { id: '1' } }),
    }),
  );

  await assert.rejects(handle(raw()), /middleware boom/);
});

void test('validates the headers target, and the 400 body has no key', async (t) => {
  stubLogger(t);
  const handle = handleFor(
    route({
      method: 'get',
      path: '/x',
      request: { headers: TenantHeaders },
      responses: { [HttpStatus.Ok]: Ok },
      handler: async () => ({ status: HttpStatus.Ok, body: { id: '1' } }),
    }),
  );

  const response = await handle(raw({ headers: {} }));

  assert.equal(response.status, 400);
  const body = response.body as { issues: { path: unknown[]; code: string; expected?: string }[] };
  assert.deepEqual(Object.keys(body), ['issues']);
  assert.deepEqual(body.issues[0]?.path, ['x-tenant']);
  assert.equal(body.issues[0]?.code, 'invalid_type');
  assert.equal(body.issues[0]?.expected, 'string', 'the extra zod fields are kept');
});
