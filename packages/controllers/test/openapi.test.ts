/* eslint-disable @typescript-eslint/require-await -- handlers must return a Promise and the test handlers have nothing to await */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HttpStatus } from '@konvoulgaris/soong-constants';
import { z } from 'zod';

import type { OpenApiDocument, OpenApiOperation } from '../src/openapi.ts';
import { generateOpenApiDocument } from '../src/openapi.ts';
import { defineController, route } from '../src/route.ts';
import type { HttpMethod, RequestSchemas } from '../src/types.ts';

const Forbidden = z.object({ key: z.literal('FORBIDDEN') }).describe('The caller may not do this.');
const NotFound = z.object({ key: z.literal('NOT_FOUND') });

const IdParameters = z.object({ id: z.string() });
const ThingQuery = z.object({ dryRun: z.boolean().optional(), limit: z.number() });
const TenantHeaders = z.object({ 'x-tenant': z.string() });
const defaultedName = z.string().default('thing');
const ThingBody = z.object({ name: defaultedName });
const ToDate = z.string().transform((value) => new Date(value));
const HealthBody = z.object({ at: ToDate });

function allow(): Promise<undefined> {
  return Promise.resolve(undefined);
}

const controller = defineController({
  updateThing: route({
    method: 'put',
    path: '/things/{id}',
    request: { params: IdParameters, query: ThingQuery, headers: TenantHeaders, body: ThingBody },
    responses: {
      [HttpStatus.Ok]: ThingBody,
      [HttpStatus.NoContent]: z.undefined(),
      [HttpStatus.NotFound]: NotFound,
    },
    pre: [{ responses: { [HttpStatus.Forbidden]: Forbidden }, run: allow }],
    handler: async () => ({ status: HttpStatus.NoContent, body: undefined }),
  }),
  health: route({
    method: 'get',
    path: '/health',
    responses: { [HttpStatus.Ok]: HealthBody },
    handler: async () => ({ status: HttpStatus.Ok, body: { at: '2026-01-01' } }),
  }),
});

function build(): OpenApiDocument {
  return generateOpenApiDocument([controller], { title: 'Test', version: '1.2.3' });
}

function operationOf(path: string, method: HttpMethod): OpenApiOperation {
  const found = build().paths[path][method];
  assert.ok(found, `${method} ${path} is in the document`);

  return found;
}

function updateThing(): OpenApiOperation {
  return operationOf('/things/{id}', 'put');
}

void test('has the OpenAPI version, the info, and one operation per route', () => {
  const document = build();

  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(document.info, { title: 'Test', version: '1.2.3' });
  assert.equal(updateThing().operationId, 'updateThing');
  assert.equal(operationOf('/health', 'get').operationId, 'health');
});

void test('puts params, query, and headers in the right place with the right required flag', () => {
  const parameters = updateThing().parameters ?? [];

  assert.deepEqual(
    parameters.map((p) => [p.name, p.in, p.required]),
    [
      ['id', 'path', true],
      ['dryRun', 'query', false],
      ['limit', 'query', true],
      ['x-tenant', 'header', true],
    ],
  );
});

void test('has no parameters key for a route with no request', () => {
  assert.equal('parameters' in operationOf('/health', 'get'), false);
});

void test('uses the input schema for the body and the output schema for responses', () => {
  const operation = updateThing();
  const body = operation.requestBody?.content['application/json'].schema ?? {};
  const ok = operation.responses['200'].content?.['application/json'].schema;

  assert.equal(operation.requestBody?.required, true);
  assert.equal('required' in body, false, 'a defaulted body property is optional on input');
  assert.deepEqual(
    ok?.required,
    ['name'],
    'a defaulted response property is always present on output',
  );
});

void test('removes $schema from every inlined schema', () => {
  assert.equal(JSON.stringify(build()).includes('$schema'), false);
});

void test('lists the own, middleware, 400, and 500 responses', () => {
  const statuses = Object.keys(updateThing().responses);

  assert.deepEqual(
    statuses.toSorted((a, b) => a.localeCompare(b)),
    ['200', '204', '400', '403', '404', '500'],
  );
});

void test('a no-content response has no content, and other responses do', () => {
  const { responses } = updateThing();

  assert.equal('content' in responses['204'], false);
  assert.equal('content' in responses['500'], false);
  assert.ok(responses['404'].content);
  assert.ok(responses['400'].content);
});

void test('uses the description of the schema, or the HTTP reason phrase', () => {
  const { responses } = updateThing();

  assert.equal(responses['403'].description, 'The caller may not do this.');
  assert.equal(responses['404'].description, 'Not Found');
  assert.equal(responses['204'].description, 'No Content');
});

void test('a response schema with a transform becomes an empty property schema and does not throw', () => {
  const schema = operationOf('/health', 'get').responses['200'].content?.['application/json']
    .schema;

  assert.deepEqual((schema?.properties as Record<string, unknown>).at, {});
});

void test('rejects a duplicate operationId', () => {
  assert.throws(
    () => generateOpenApiDocument([controller, controller], { title: 'Test', version: '1' }),
    /Duplicate operationId/,
  );
});

type SingleRoute = { request: RequestSchemas; path: string; method?: HttpMethod };

function documentFor(
  name: string,
  { request, path, method = 'get' }: SingleRoute,
): OpenApiDocument {
  const single = defineController({
    [name]: route({
      method,
      path,
      request,
      responses: { [HttpStatus.Ok]: z.undefined() },
      handler: async () => ({ status: HttpStatus.Ok, body: undefined }),
    }),
  });

  return generateOpenApiDocument([single], { title: 'Test', version: '1' });
}

void test('a query parameter with a default is not required', () => {
  const request = { query: z.object({ page: z.number().default(1) }) };
  const document = documentFor('list', { request, path: '/x' });

  assert.equal(document.paths['/x'].get?.parameters?.[0]?.required, false);
});

void test('a path parameter is required even when its schema key is optional', () => {
  const request = { params: z.object({ id: z.string().optional() }) };
  const document = documentFor('find', { request, path: '/x/{id}' });
  const parameter = document.paths['/x/{id}'].get?.parameters?.[0];

  assert.deepEqual([parameter?.name, parameter?.in, parameter?.required], ['id', 'path', true]);
});

void test('routes with different methods on one path share the path entry', () => {
  const request = { params: IdParameters };
  const things = defineController({
    getThing: route({
      method: 'get',
      path: '/things/{id}',
      request,
      responses: { [HttpStatus.Ok]: z.undefined() },
      handler: async () => ({ status: HttpStatus.Ok, body: undefined }),
    }),
    putThing: route({
      method: 'put',
      path: '/things/{id}',
      request,
      responses: { [HttpStatus.Ok]: z.undefined() },
      handler: async () => ({ status: HttpStatus.Ok, body: undefined }),
    }),
  });
  const both = generateOpenApiDocument([things], { title: 'Test', version: '1' });

  assert.deepEqual(Object.keys(both.paths), ['/things/{id}']);
  assert.deepEqual(
    Object.keys(both.paths['/things/{id}']).toSorted((a, b) => a.localeCompare(b)),
    ['get', 'put'],
  );
});

void test('rejects a schema with an id, because $ref and components are not supported', () => {
  const Shared = z.object({ name: z.string() }).meta({ id: 'Shared' });
  const request = { body: z.object({ first: Shared, second: Shared }) };

  assert.throws(
    () => documentFor('shared', { request, path: '/x', method: 'post' }),
    /\$ref and components are not supported/,
  );
});

type Node = { name: string; child?: Node[] | undefined };
const Node: z.ZodType<Node> = z.object({
  name: z.string(),
  child: z.lazy(() => z.array(Node)).optional(),
});

void test('rejects a recursive request body, because its $ref would dangle', () => {
  assert.throws(
    () => documentFor('tree', { request: { body: Node }, path: '/x', method: 'post' }),
    /\$ref and components are not supported/,
  );
});

void test('rejects a recursive response schema, because its $ref would dangle', () => {
  const tree = defineController({
    tree: route({
      method: 'get',
      path: '/x',
      request: {},
      responses: { [HttpStatus.Ok]: Node },
      handler: async () => ({ status: HttpStatus.Ok, body: { name: 'root' } }),
    }),
  });

  assert.throws(
    () => generateOpenApiDocument([tree], { title: 'Test', version: '1' }),
    /\$ref and components are not supported/,
  );
});

void test('a property named $ref is a normal property', () => {
  const request = { body: z.object({ $ref: z.string() }) };
  const document = documentFor('named', { request, path: '/x', method: 'post' });
  const schema = document.paths['/x'].post?.requestBody?.content['application/json'].schema;

  assert.deepEqual(schema?.properties, { $ref: { type: 'string' } });
});
