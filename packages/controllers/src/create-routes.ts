import { HttpStatus } from '@konvoulgaris/soong-constants';
import { z } from 'zod';

import { createHandle } from './pipeline.ts';
import { statusEntries } from './responses.ts';
import type {
  AnyRoute,
  Controller,
  HttpMethod,
  HttpStatusCode,
  RawRequest,
  RequestSchemas,
  ResponseSchemas,
  SoongControllerResponse,
} from './types.ts';
import { ValidationErrorResponse } from './validation-error.ts';

export type Route = {
  operationId: string;
  method: HttpMethod;
  path: string;
  request: RequestSchemas; // {} when the route declares no request
  responses: ResponseSchemas; // the declared set, including the implicit 400 and 500
  handle: (raw: RawRequest) => Promise<SoongControllerResponse<unknown>>;
};

// Who declared a status: the route, the middleware at an index, or the framework (the implicit 400 and 500).
type StatusSource = 'route' | 'framework' | number;

function describeSource(source: StatusSource): string {
  if (source === 'route') {
    return 'the route';
  }

  return source === 'framework' ? 'the framework' : `middleware ${String(source)}`;
}

// The own responses, the middleware responses, the 400 when there is a request, and the 500.
// A status that is declared twice, or that is reserved, is a mistake.
export function declareResponses(operationId: string, definition: AnyRoute): ResponseSchemas {
  const declared: ResponseSchemas = {};
  const sources = new Map<HttpStatusCode, StatusSource>();

  function add(status: HttpStatusCode, schema: z.ZodType, source: StatusSource): void {
    const first = sources.get(status);

    if (first !== undefined) {
      const prefix = `Route ${operationId}: status ${String(status)}`;

      throw new Error(
        source === 'framework'
          ? `${prefix} is reserved by the framework, remove it from the responses of ${describeSource(first)}`
          : `${prefix} is declared by both ${describeSource(first)} and ${describeSource(source)}`,
      );
    }

    sources.set(status, source);
    declared[status] = schema;
  }

  for (const [status, schema] of statusEntries(definition.responses)) {
    add(status, schema, 'route');
  }

  const middlewares = definition.pre ?? [];

  for (const [index, middleware] of middlewares.entries()) {
    for (const [status, schema] of statusEntries(middleware.responses)) {
      add(status, schema, index);
    }
  }

  if (definition.request !== undefined) {
    add(HttpStatus.BadRequest, ValidationErrorResponse, 'framework');
  }

  add(HttpStatus.InternalServerError, z.undefined(), 'framework');

  return declared;
}

function checkPathParameters(operationId: string, definition: AnyRoute): void {
  const placeholders = definition.path
    .matchAll(/\{([^}]+)\}/g)
    .map((match) => match[1])
    .toArray()
    .toSorted((a, b) => a.localeCompare(b));
  const keys = Object.keys(definition.request?.params?.shape ?? {}).toSorted((a, b) =>
    a.localeCompare(b),
  );

  if (placeholders.join(',') !== keys.join(',')) {
    throw new Error(
      `Route ${operationId}: the placeholders of ${definition.path} (${placeholders.join(',')}) are not the keys of the params schema (${keys.join(',')})`,
    );
  }
}

// The one boundary between the core and an adapter. It checks the definitions and returns a flat list.
export function createRoutes(controllers: readonly Controller[]): Route[] {
  const operationIds = new Set<string>();

  return controllers.flatMap((controller) =>
    Object.entries(controller).map(([operationId, definition]) => {
      if (operationIds.has(operationId)) {
        throw new Error(`Duplicate operationId ${operationId}`);
      }

      operationIds.add(operationId);
      checkPathParameters(operationId, definition);
      const declared = declareResponses(operationId, definition);

      return {
        operationId,
        method: definition.method,
        path: definition.path,
        request: definition.request ?? {},
        responses: declared,
        handle: createHandle(operationId, definition, declared),
      };
    }),
  );
}
