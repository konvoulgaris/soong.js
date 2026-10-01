/* eslint-disable @typescript-eslint/require-await -- handlers and middleware are async by contract */
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { test } from 'node:test';

import { HttpStatus } from '@konvoulgaris/soong-constants';
import type {
  AnyPreOperationMiddleware,
  PreOperationMiddleware,
} from '@konvoulgaris/soong-controllers';
import { defineController, route } from '@konvoulgaris/soong-controllers';
import { logger } from '@konvoulgaris/soong-utils';
import type { FastifyError, FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { z } from 'zod';

import { registerControllers } from '../src/register-controllers.ts';

const Forbidden = z.object({ key: z.literal('FORBIDDEN') });
const NotFound = z.object({ key: z.literal('NOT_FOUND') });

const IdParameters = z.object({ id: z.string() });
const UpdateQuery = z.object({ limit: z.coerce.number().default(10) });
const TenantHeaders = z.object({ 'x-tenant': z.string() });
const NameBody = z.object({ name: z.string() });
const Customer = z.object({
  id: z.string(),
  limit: z.number(),
  tenant: z.string(),
  name: z.string(),
});
const NoContent = z.undefined();
const GreetingText = z.string();

function noop(): undefined {
  return;
}

// Answers 403 unless the request has the header x-allow.
const requireAllow: PreOperationMiddleware<{ 403: typeof Forbidden }> = {
  responses: { [HttpStatus.Forbidden]: Forbidden },
  run: async (request) =>
    request.headers['x-allow'] === undefined
      ? { status: HttpStatus.Forbidden, body: { key: 'FORBIDDEN' } }
      : undefined,
};

// The paths that the recording middleware saw.
const seenPaths: string[] = [];

const recordPath: AnyPreOperationMiddleware = {
  responses: {},
  run: async (request): Promise<undefined> => {
    seenPaths.push(request.path);

    return undefined;
  },
};

const customers = defineController({
  updateCustomer: route({
    method: 'post',
    path: '/customers/{id}',
    request: {
      params: IdParameters,
      query: UpdateQuery,
      headers: TenantHeaders,
      body: NameBody,
    },
    responses: { [HttpStatus.Ok]: Customer },
    pre: [recordPath],
    handler: async (request) => ({
      status: HttpStatus.Ok,
      body: {
        id: request.params.id,
        limit: request.query.limit,
        tenant: request.headers['x-tenant'],
        name: request.body.name,
      },
    }),
  }),
  deleteCustomer: route({
    method: 'delete',
    path: '/customers/{id}',
    request: { params: IdParameters },
    responses: { [HttpStatus.NoContent]: NoContent, [HttpStatus.NotFound]: NotFound },
    pre: [requireAllow],
    handler: async (request) =>
      request.params.id === 'missing'
        ? { status: HttpStatus.NotFound, body: { key: 'NOT_FOUND' } }
        : { status: HttpStatus.NoContent, body: undefined },
  }),
});

const greetings = defineController({
  getGreeting: route({
    method: 'get',
    path: '/greeting',
    responses: { [HttpStatus.Ok]: GreetingText },
    handler: async () => ({ status: HttpStatus.Ok, body: 'hello' }),
  }),
});

function build(
  t: TestContext,
  options?: Parameters<typeof registerControllers>[2],
): FastifyInstance {
  t.mock.method(logger, 'warn', noop);
  t.mock.method(logger, 'error', noop);
  const app = Fastify();
  registerControllers(app, [customers], options);
  t.after(() => app.close());

  return app;
}

void test('a request reaches the handler parsed, and the response is sent', async (t) => {
  const app = build(t);

  const response = await app.inject({
    method: 'POST',
    url: '/customers/7?limit=3',
    headers: { 'x-tenant': 'acme' },
    payload: { name: 'Ada' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { id: '7', limit: 3, tenant: 'acme', name: 'Ada' });
});

void test('a middleware sees the path without the query string', async (t) => {
  const app = build(t);
  seenPaths.length = 0;

  await app.inject({
    method: 'POST',
    url: '/customers/7?limit=3',
    headers: { 'x-tenant': 'acme' },
    payload: { name: 'Ada' },
  });

  assert.deepEqual(seenPaths, ['/customers/7']);
});

void test('a no-content response is sent empty', async (t) => {
  const app = build(t);

  const response = await app.inject({
    method: 'DELETE',
    url: '/customers/7',
    headers: { 'x-allow': '1' },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
});

void test('a string body is sent as a JSON string', async (t) => {
  t.mock.method(logger, 'warn', noop);
  const app = Fastify();
  registerControllers(app, [greetings]);
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/greeting' });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type']), /^application\/json/);
  assert.equal(JSON.parse(response.body), 'hello');
});

void test('a declared error response is sent with its status and body', async (t) => {
  const app = build(t);

  const response = await app.inject({
    method: 'DELETE',
    url: '/customers/missing',
    headers: { 'x-allow': '1' },
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { key: 'NOT_FOUND' });
});

void test('a middleware answers before validation', async (t) => {
  const app = build(t);

  const response = await app.inject({ method: 'DELETE', url: '/customers/7' });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { key: 'FORBIDDEN' });
});

void test('invalid input gives a 400 with the zod issues and no key', async (t) => {
  const app = build(t);

  const response = await app.inject({ method: 'POST', url: '/customers/7', payload: { name: 1 } });

  assert.equal(response.statusCode, 400);
  const body = response.json<{ issues: { path: unknown[] }[]; key?: string }>();
  assert.equal('key' in body, false);
  assert.deepEqual(
    body.issues.map((issue) => issue.path).toSorted((a, b) => String(a).localeCompare(String(b))),
    [['name'], ['x-tenant']],
  );
});

void test('malformed JSON gives a 400 with no issues', async (t) => {
  const app = build(t);

  const response = await app.inject({
    method: 'POST',
    url: '/customers/7',
    headers: { 'content-type': 'application/json', 'x-tenant': 'acme' },
    payload: '{bad',
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { issues: [] });
});

void test('an empty JSON body gives a 400 with no issues', async (t) => {
  const app = build(t);

  const response = await app.inject({
    method: 'POST',
    url: '/customers/7',
    headers: { 'content-type': 'application/json', 'x-tenant': 'acme' },
    payload: '',
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { issues: [] });
});

void test('other errors, such as a 415, reach the error handler of the app', async (t) => {
  t.mock.method(logger, 'warn', noop);
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the request argument is unused
  app.setErrorHandler((error: FastifyError, _request, reply) =>
    reply.status(error.statusCode ?? 500).send({ fromApp: error.code }),
  );
  registerControllers(app, [customers]);
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/customers/7',
    headers: { 'content-type': 'application/xml' },
    payload: '<a/>',
  });

  assert.equal(response.statusCode, 415);
  assert.deepEqual(response.json(), { fromApp: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' });
});

void test('a body over the limit reaches the error handler of the app as a 413', async (t) => {
  t.mock.method(logger, 'warn', noop);
  const app = Fastify({ bodyLimit: 10 });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the request argument is unused
  app.setErrorHandler((error: FastifyError, _request, reply) =>
    reply.status(error.statusCode ?? 500).send({ fromApp: error.code }),
  );
  registerControllers(app, [customers]);
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/customers/7',
    headers: { 'x-tenant': 'acme' },
    payload: { name: 'a name that is longer than ten bytes' },
  });

  assert.equal(response.statusCode, 413);
  assert.deepEqual(response.json(), { fromApp: 'FST_ERR_CTP_BODY_TOO_LARGE' });
});

void test('the error handler of the plugin does not apply to the routes of the app', async (t) => {
  t.mock.method(logger, 'warn', noop);
  t.mock.method(logger, 'error', noop);
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the request argument is unused
  app.setErrorHandler((error: FastifyError, _request, reply) =>
    reply.status(error.statusCode ?? 500).send({ fromApp: error.code }),
  );
  registerControllers(app, [customers]);
  // After the registration, so a handler set on the root instance would apply to this route.
  app.post('/own', async () => ({ ok: true }));
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/own',
    headers: { 'content-type': 'application/json' },
    payload: '{bad',
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { fromApp: 'FST_ERR_CTP_INVALID_JSON_BODY' });
});

void test('serves the OpenAPI document when openapi is set', async (t) => {
  const app = build(t, {
    openapi: { path: '/openapi.json', title: 'Customers', version: '1.0.0' },
  });

  const response = await app.inject({ method: 'GET', url: '/openapi.json' });

  assert.equal(response.statusCode, 200);
  const document = response.json<{
    openapi: string;
    paths: Record<string, Record<string, { operationId: string }>>;
  }>();
  assert.equal(document.openapi, '3.1.0');
  assert.equal(document.paths['/customers/{id}'].post.operationId, 'updateCustomer');
});

void test('does not serve the OpenAPI document without the option', async (t) => {
  const app = build(t);

  const response = await app.inject({ method: 'GET', url: '/openapi.json' });

  assert.equal(response.statusCode, 404);
});

void test('throws at registration on a duplicate operationId', (t) => {
  t.mock.method(logger, 'warn', noop);
  const app = Fastify();
  t.after(() => app.close());

  assert.throws(() => {
    registerControllers(app, [customers, customers]);
  }, /Duplicate operationId/);
});
