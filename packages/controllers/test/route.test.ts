/* eslint-disable @typescript-eslint/require-await -- handlers must return a Promise and the test handlers have nothing to await */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HttpStatus } from '@konvoulgaris/soong-constants';
import { z } from 'zod';

import { defineController, route } from '../src/route.ts';
import type { AnyRoute } from '../src/types.ts';

const Path = z.object({ id: z.string() });
const Ok = z.object({ ok: z.boolean() });

void test('defineController returns the controller it is given', () => {
  const health = route({
    method: 'get',
    path: '/health',
    responses: { [HttpStatus.Ok]: Ok },
    handler: async () => ({ status: HttpStatus.Ok, body: { ok: true } }),
  });
  const controller = defineController({ health });

  assert.equal(controller.health, health);
});

void test('a handler reads the parsed request with the types of its schemas', async () => {
  const read = route({
    method: 'get',
    path: '/things/{id}',
    request: { params: Path },
    responses: { [HttpStatus.Ok]: z.object({ id: z.string() }) },
    handler: async (request) => {
      const id: string = request.params.id;

      return { status: HttpStatus.Ok, body: { id } };
    },
  });

  const response = await read.handler({ params: { id: '7' } } as never);

  assert.equal(response.status, HttpStatus.Ok);
});

void test('pnpm typecheck checks that the types reject wrong handlers', () => {
  const rejected = [
    (): AnyRoute =>
      route({
        method: 'get',
        path: '/a',
        responses: { [HttpStatus.Ok]: Ok },
        // @ts-expect-error the status 404 is not declared
        handler: async () => ({ status: HttpStatus.NotFound, body: { ok: true } }),
      }),
    (): AnyRoute =>
      route({
        method: 'get',
        path: '/b',
        responses: { [HttpStatus.Ok]: Ok },
        // @ts-expect-error the body does not match the schema
        handler: async () => ({ status: HttpStatus.Ok, body: { ok: 'yes' } }),
      }),
    (): AnyRoute =>
      route({
        method: 'get',
        path: '/c',
        responses: { [HttpStatus.Ok]: Ok },
        handler: async (request) => {
          // @ts-expect-error the route declares no request, so there is no body
          assert.ok(request.body === undefined);

          return { status: HttpStatus.Ok, body: { ok: true } };
        },
      }),
  ];

  // TypeScript checks the calls above. The test only keeps them in a test file.
  assert.equal(rejected.length, 3);
});
