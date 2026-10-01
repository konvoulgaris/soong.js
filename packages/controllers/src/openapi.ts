import { STATUS_CODES } from 'node:http';

import { z } from 'zod';

import type { Route } from './create-routes.ts';
import { createRoutes } from './create-routes.ts';
import { statusEntries } from './responses.ts';
import type { Controller, HttpStatusCode, RequestSchemas } from './types.ts';

export type OpenApiInfo = { title: string; version: string };

export type OpenApiDocument = {
  openapi: '3.1.0';
  info: OpenApiInfo;
  paths: Record<string, Record<string, unknown>>;
};

type JsonSchema = Record<string, unknown>;

const parameterLocations = [
  ['params', 'path'],
  ['query', 'query'],
  ['headers', 'header'],
] as const;

// `input` is what a client sends. `output` is what it receives. A type that JSON Schema cannot show becomes an empty schema.
function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json: JsonSchema = z.toJSONSchema(schema, { io, unrepresentable: 'any' });
  delete json.$schema;

  return json;
}

function parameters(request: RequestSchemas): JsonSchema[] {
  return parameterLocations.flatMap(([target, location]) => {
    const schema = request[target];

    if (schema === undefined) {
      return [];
    }

    const json = toJsonSchema(schema, 'input');
    const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
    const required = (json.required ?? []) as string[];

    return Object.entries(properties).map(([name, propertySchema]) => ({
      name,
      in: location,
      required: location === 'path' || required.includes(name),
      schema: propertySchema,
    }));
  });
}

function response(status: HttpStatusCode, schema: z.ZodType): JsonSchema {
  const description = schema.description ?? STATUS_CODES[status] ?? '';

  // z.undefined() is the schema of a response with no body.
  return schema instanceof z.ZodUndefined
    ? { description }
    : { description, content: { 'application/json': { schema: toJsonSchema(schema, 'output') } } };
}

function operation(route: Route): JsonSchema {
  const parameterList = parameters(route.request);

  return {
    operationId: route.operationId,
    ...(parameterList.length > 0 && { parameters: parameterList }),
    ...(route.request.body !== undefined && {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: toJsonSchema(route.request.body, 'input') } },
      },
    }),
    responses: Object.fromEntries(
      statusEntries(route.responses).map(([status, schema]) => [status, response(status, schema)]),
    ),
  };
}

export function generateOpenApiDocument(
  controllers: readonly Controller[],
  info: OpenApiInfo,
): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};

  for (const route of createRoutes(controllers)) {
    (paths[route.path] ??= {})[route.method] = operation(route);
  }

  return { openapi: '3.1.0', info: { title: info.title, version: info.version }, paths };
}
