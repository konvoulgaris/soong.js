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

// The own responses, the middleware responses, the 400 when there is a request, and the 500.
// A status that is declared twice, or that is reserved, is a mistake.
export function declareResponses(operationId: string, definition: AnyRoute): ResponseSchemas {
  const declared: ResponseSchemas = {};

  function add(status: HttpStatusCode, schema: z.ZodType): void {
    if (declared[status] !== undefined) {
      throw new Error(
        `Route ${operationId} declares status ${String(status)} twice, or declares a reserved status`,
      );
    }

    declared[status] = schema;
  }

  for (const [status, schema] of statusEntries(definition.responses)) {
    add(status, schema);
  }

  const middlewares = definition.pre ?? [];

  for (const middleware of middlewares) {
    for (const [status, schema] of statusEntries(middleware.responses)) {
      add(status, schema);
    }
  }

  if (definition.request !== undefined) {
    add(HttpStatus.BadRequest, ValidationErrorResponse);
  }

  add(HttpStatus.InternalServerError, z.undefined());

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
