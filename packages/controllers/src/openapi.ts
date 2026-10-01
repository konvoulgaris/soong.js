import { STATUS_CODES } from 'node:http';

import { z } from 'zod';

import type { Route } from './create-routes.ts';
import { createRoutes } from './create-routes.ts';
import { statusEntries } from './responses.ts';
import type { Controller, HttpMethod, HttpStatusCode, RequestSchemas } from './types.ts';

export type OpenApiInfo = { title: string; version: string };

type JsonSchema = z.core.JSONSchema.BaseSchema;

export type OpenApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: z.core.JSONSchema._JSONSchema;
};

export type OpenApiResponse = {
  description: string;
  content?: { 'application/json': { schema: JsonSchema } };
};

export type OpenApiOperation = {
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: { required: true; content: { 'application/json': { schema: JsonSchema } } };
  responses: Record<string, OpenApiResponse>;
};

export type OpenApiDocument = {
  openapi: '3.1.0';
  info: OpenApiInfo;
  paths: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>>;
};

const parameterLocations = [
  ['params', 'path'],
  ['query', 'query'],
  ['headers', 'header'],
] as const;

// `input` is what a client sends. `output` is what it receives. A type that JSON Schema cannot show becomes an empty schema.
// A defaulted field is optional on input and always present on output.
function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' });

  if (json.$defs !== undefined) {
    throw new Error(
      'A schema uses .meta({ id }) or is recursive. $ref and components are not supported yet. Inline the schema (remove the id) instead.',
    );
  }

  // The schema is embedded in an OpenAPI document, which has its own dialect.
  delete json.$schema;

  return json;
}

function parameters(request: RequestSchemas): OpenApiParameter[] {
  return parameterLocations.flatMap(([target, location]) => {
    const schema = request[target];

    if (schema === undefined) {
      return [];
    }

    const json = toJsonSchema(schema, 'input');
    const properties = json.properties ?? {};
    const required = json.required ?? [];

    return Object.entries(properties).map(([name, propertySchema]) => ({
      name,
      in: location,
      // OpenAPI requires every path parameter to be required, whatever the schema says.
      required: location === 'path' || required.includes(name),
      schema: propertySchema,
    }));
  });
}

function response(status: HttpStatusCode, schema: z.ZodType): OpenApiResponse {
  const description = schema.description ?? STATUS_CODES[status] ?? '';

  // Only z.undefined() means "no content". A z.void() or an optional undefined gets an empty schema under application/json.
  return schema instanceof z.ZodUndefined
    ? { description }
    : { description, content: { 'application/json': { schema: toJsonSchema(schema, 'output') } } };
}

function operation(route: Route): OpenApiOperation {
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
