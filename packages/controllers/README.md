# @konvoulgaris/soong-controllers

Declare a route and its handler once, as an object. The zod schemas are the only source of truth for validation, handler types, and the OpenAPI document.

The core has no framework import. `@konvoulgaris/soong-controllers-fastify-adapter` registers the controllers on a Fastify app.

## Install

The packages are on GitHub Packages. Set up the registry and a token as described in the [install steps of the repository](https://github.com/konvoulgaris/soong.js#install). Then install:

```sh
pnpm add @konvoulgaris/soong-constants @konvoulgaris/soong-utils @konvoulgaris/soong-controllers zod
pnpm add @konvoulgaris/soong-controllers-fastify-adapter fastify
```

- The controllers packages take their soong packages, `fastify`, and `zod` as peer dependencies, so you install them yourself.
- Keep every soong package on the same minor version. A mismatch makes the install fail with a peer dependency error, so the app never runs two copies of a package.
- The core needs Node 22 or later, because it uses iterator helpers.

## Declare routes

Group the routes of one area in a controller. The key of each route is its OpenAPI `operationId`. The handler is a service-layer function. Its types come from the schemas of the route.

```ts
import { HttpStatus } from '@konvoulgaris/soong-constants';
import { defineController, route } from '@konvoulgaris/soong-controllers';
import { z } from 'zod';

export const customers = defineController({
  deleteCustomer: route({
    method: 'delete',
    path: '/api/customers/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      [HttpStatus.NoContent]: z.undefined(),
      [HttpStatus.NotFound]: z.object({ key: z.literal('NOT_FOUND') }),
    },
    // customerService is your own service-layer code. Here, delete returns
    // Promise<{ status: 204; body: undefined } | { status: 404; body: { key: 'NOT_FOUND' } }>
    handler: async (request) => customerService.delete(request.params.id),
  }),
});
```

- A route has a `method`, a `path` in OpenAPI style (`/api/customers/{id}`), an optional `request` (`params`, `query`, `headers`, `body`), its `responses` by status, optional `pre` middlewares, and a `handler`.
- A handler returns `{ status, body }`. TypeScript accepts only the statuses and bodies that the route declares.
- `z.undefined()` means no body. A `string` body is sent as a JSON string.
- Use `HttpStatus` from `@konvoulgaris/soong-constants` for every status.
- Header names in a `headers` schema must be lower case, because Fastify lower-cases them. Query values arrive as strings, so use `z.coerce` for numbers and booleans.

## Register on Fastify

```ts
import { registerControllers } from '@konvoulgaris/soong-controllers-fastify-adapter';
import Fastify from 'fastify';

const app = Fastify();
registerControllers(app, [customers], {
  openapi: { path: '/openapi.json', title: 'Pullbox', version: '1.0.0' },
});
```

- The `openapi` option is off by default. When you set it, the adapter serves the document at `path`.
- Other Fastify errors (415, 413) and errors that a handler throws go to the error handler of your app. The adapter turns only a malformed or empty JSON body into the 400 `{ issues }`.
- For another framework, call `createRoutes(controllers)` and run `route.handle(rawRequest)` for each route. The adapter is the model.

## How a request runs

1. The `pre` middlewares run in order. They can answer with a declared response, for example a 403. The first answer ends the request.
2. The core validates `params`, `query`, `headers`, and `body`, and collects all the issues.
3. The handler runs with the parsed request.
4. The core parses the response body with the schema of its status, and sends the parsed result. Unknown keys do not leave.

Fastify parses the body before the `pre` middlewares run. A malformed JSON body or an unsupported content type gets its 400 or 415 before a middleware can answer 401 or 403. A body that is valid JSON but fails the schema does reach the middlewares first.

## Errors and logs

- A failed validation gives a 400 with the body `{ issues }`, and the log gets `REQUEST_VALIDATION_FAILED`. The log carries `operationId` and `issues`.
- A response that does not match its schema gives an empty 500, and the log gets `RESPONSE_VALIDATION_FAILED`. The log carries `operationId`, `status`, `issues`, and a `reason`: `undeclared_status` or `invalid_body`.
- A handler can return only the statuses in its own `responses`. The core adds the 400 for a route with a `request`, and the 500, to the document.

## Checks at registration

`registerControllers` throws at once for these errors in the definitions:

- a duplicate `operationId`,
- two routes with the same method and path (placeholders that differ only by name, such as `/a/{id}` and `/a/{name}`, count as the same path),
- path placeholders that do not match the params schema,
- a reserved or duplicate response status (the 400 of a route with a `request`, and the 500, are reserved).

A clash between the OpenAPI path and a route path shows up when the app becomes ready (`await app.ready()` or `listen`).

## OpenAPI

`generateOpenApiDocument(controllers, { title, version })` returns an OpenAPI 3.1 document as a plain object. Request schemas use the input type, and response schemas use the output type.

Schemas that need `$ref` are not supported yet. These are a schema with `.meta({ id })` and a recursive schema. The generator throws for them.
