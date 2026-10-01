/* eslint-disable @typescript-eslint/require-await -- handlers must return a Promise and the test handlers have nothing to await */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HttpStatus } from '@konvoulgaris/soong-constants';
import { z } from 'zod';

import { createRoutes } from '../src/create-routes.ts';
import { defineController, route } from '../src/route.ts';
import { ValidationErrorResponse } from '../src/validation-error.ts';

const Ok = z.object({ ok: z.boolean() });
const Forbidden = z.object({ key: z.literal('FORBIDDEN') });
const IdParameters = z.object({ id: z.string() });
const NameParameters = z.object({ name: z.string() });
const NameBody = z.object({ name: z.string() });

async function ok(): Promise<{ status: 200; body: { ok: boolean } }> {
  return { status: HttpStatus.Ok, body: { ok: true } };
}

async function allow(): Promise<undefined> {
  return undefined;
}

void test('returns one route per controller entry, in order', () => {
  const routes = createRoutes([
    defineController({
      listThings: route({
        method: 'get',
        path: '/things',
        responses: { [HttpStatus.Ok]: Ok },
        handler: ok,
      }),
      readThing: route({
        method: 'get',
        path: '/things/{id}',
        request: { params: IdParameters },
        responses: { [HttpStatus.Ok]: Ok },
        handler: ok,
      }),
    }),
  ]);

  assert.deepEqual(
    routes.map((r) => [r.operationId, r.method, r.path]),
    [
      ['listThings', 'get', '/things'],
      ['readThing', 'get', '/things/{id}'],
    ],
  );
});

void test('declares the own, middleware, 400, and 500 responses', () => {
  const [created] = createRoutes([
    defineController({
      createThing: route({
        method: 'post',
        path: '/things',
        request: { body: NameBody },
        responses: { [HttpStatus.Ok]: Ok },
        pre: [{ responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow }],
        handler: ok,
      }),
    }),
  ]);

  assert.deepEqual(Object.keys(created.responses), ['200', '400', '403', '500']);
  assert.equal(created.responses[HttpStatus.BadRequest], ValidationErrorResponse);
});

void test('does not declare a 400 for a route with no request', () => {
  const [health] = createRoutes([
    defineController({
      health: route({
        method: 'get',
        path: '/health',
        responses: { [HttpStatus.Ok]: Ok },
        handler: ok,
      }),
    }),
  ]);

  assert.deepEqual(Object.keys(health.responses), ['200', '500']);
  assert.deepEqual(health.request, {});
});

void test('throws on a duplicate operationId across controllers', () => {
  const a = defineController({
    same: route({ method: 'get', path: '/a', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });
  const b = defineController({
    same: route({ method: 'get', path: '/b', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });

  assert.throws(() => createRoutes([a, b]), /Duplicate operationId same/);
});

void test('throws when two controllers handle the same method and path', () => {
  const a = defineController({
    first: route({ method: 'get', path: '/a', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });
  const b = defineController({
    second: route({ method: 'get', path: '/a', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });

  assert.throws(() => createRoutes([a, b]), /Routes first and second both handle GET \/a/);
});

void test('throws when paths differ only by the name of a placeholder', () => {
  const a = defineController({
    first: route({
      method: 'get',
      path: '/a/{id}',
      request: { params: IdParameters },
      responses: { [HttpStatus.Ok]: Ok },
      handler: ok,
    }),
  });
  const b = defineController({
    second: route({
      method: 'get',
      path: '/a/{name}',
      request: { params: NameParameters },
      responses: { [HttpStatus.Ok]: Ok },
      handler: ok,
    }),
  });

  assert.throws(
    () => createRoutes([a, b]),
    /Routes first and second both handle GET \/a\/\{name\}/,
  );
});

void test('allows the same path with different methods, and the same method with different paths', () => {
  const controller = defineController({
    read: route({ method: 'get', path: '/a', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
    write: route({ method: 'post', path: '/a', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
    other: route({ method: 'get', path: '/b', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });

  assert.doesNotThrow(() => createRoutes([controller]));
});

void test('throws when the path placeholders are not the keys of the params schema', () => {
  const missingSchema = defineController({
    a: route({ method: 'get', path: '/a/{id}', responses: { [HttpStatus.Ok]: Ok }, handler: ok }),
  });
  const extraKey = defineController({
    b: route({
      method: 'get',
      path: '/b',
      request: { params: IdParameters },
      responses: { [HttpStatus.Ok]: Ok },
      handler: ok,
    }),
  });

  assert.throws(() => createRoutes([missingSchema]), /placeholders/);
  assert.throws(() => createRoutes([extraKey]), /placeholders/);
});

void test('throws when a route declares the reserved 500', () => {
  const controller = defineController({
    a: route({
      method: 'get',
      path: '/a',
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.InternalServerError]: Ok },
      handler: ok,
    }),
  });

  assert.throws(() => createRoutes([controller]), /status 500/);
});

void test('throws when a route with a request declares the reserved 400', () => {
  const controller = defineController({
    a: route({
      method: 'post',
      path: '/a',
      request: { body: z.object({}) },
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.BadRequest]: Ok },
      handler: ok,
    }),
  });

  assert.throws(() => createRoutes([controller]), /status 400/);
});

void test('allows a 400 on a route with no request', () => {
  const controller = defineController({
    a: route({
      method: 'get',
      path: '/a',
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.BadRequest]: Ok },
      handler: ok,
    }),
  });

  assert.doesNotThrow(() => createRoutes([controller]));
});

void test('throws when a middleware and the route declare the same status', () => {
  const controller = defineController({
    a: route({
      method: 'get',
      path: '/a',
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.Forbidden]: Forbidden },
      pre: [{ responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow }],
      handler: ok,
    }),
  });

  assert.throws(() => createRoutes([controller]), /status 403/);
});

void test('throws when two middlewares declare the same status', () => {
  const controller = defineController({
    a: route({
      method: 'get',
      path: '/a',
      responses: { [HttpStatus.Ok]: Ok },
      pre: [
        { responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow },
        { responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow },
      ],
      handler: ok,
    }),
  });

  assert.throws(
    () => createRoutes([controller]),
    /status 403 is declared by both middleware 0 and middleware 1/,
  );
});

void test('says why a reserved status and a shared status are rejected', () => {
  const reserved = defineController({
    a: route({
      method: 'get',
      path: '/a',
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.InternalServerError]: Ok },
      handler: ok,
    }),
  });
  const shared = defineController({
    b: route({
      method: 'get',
      path: '/b',
      responses: { [HttpStatus.Ok]: Ok, [HttpStatus.Forbidden]: Forbidden },
      pre: [{ responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow }],
      handler: ok,
    }),
  });

  assert.throws(
    () => createRoutes([reserved]),
    /Route a: status 500 is reserved by the framework, remove it from the responses of the route/,
  );
  assert.throws(
    () => createRoutes([shared]),
    /Route b: status 403 is declared by both the route and middleware 0/,
  );
});

void test('handle runs the pipeline of the route', async () => {
  const [health] = createRoutes([
    defineController({
      health: route({
        method: 'get',
        path: '/health',
        responses: { [HttpStatus.Ok]: Ok },
        handler: ok,
      }),
    }),
  ]);

  const response = await health.handle({
    method: 'GET',
    path: '/health',
    headers: {},
    query: {},
    params: {},
    body: undefined,
  });

  assert.deepEqual(response, { status: 200, body: { ok: true } });
});
