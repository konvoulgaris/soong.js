import { HttpStatus } from '@konvoulgaris/soong-constants';
import type { Controller, HttpMethod } from '@konvoulgaris/soong-controllers';
import { createRoutes, generateOpenApiDocument } from '@konvoulgaris/soong-controllers';
import { logger } from '@konvoulgaris/soong-utils';
import type { FastifyError, FastifyInstance, HTTPMethods } from 'fastify';

export type RegisterControllersOptions = {
  openapi?: { path: string; title: string; version: string };
};

const fastifyMethods = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
} as const satisfies Record<HttpMethod, HTTPMethods>;

// Fastify errors for a body that is not valid JSON.
const jsonBodyErrorCodes = new Set([
  'FST_ERR_CTP_INVALID_JSON_BODY',
  'FST_ERR_CTP_EMPTY_JSON_BODY',
]);

// An OpenAPI path uses {id}. Fastify uses :id.
function toFastifyPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ':$1');
}

// Throws at once, not on the first request, when the definitions are wrong.
export function registerControllers(
  fastify: FastifyInstance,
  controllers: readonly Controller[],
  options: RegisterControllersOptions = {},
): void {
  const routes = createRoutes(controllers);
  const document = options.openapi
    ? generateOpenApiDocument(controllers, {
        title: options.openapi.title,
        version: options.openapi.version,
      })
    : undefined;

  // One encapsulated plugin, so the error handler below applies only to these routes.
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify wants a promise-returning plugin
  void fastify.register(async (scope) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the request argument is unused
    scope.setErrorHandler((error: FastifyError, _request, reply) => {
      if (jsonBodyErrorCodes.has(error.code)) {
        logger.warn({ key: 'REQUEST_VALIDATION_FAILED', issues: [] });

        return reply.status(HttpStatus.BadRequest).send({ issues: [] });
      }

      // Rethrown, so the error handler of the app handles it.
      throw error;
    });

    for (const route of routes) {
      scope.route({
        method: fastifyMethods[route.method],
        url: toFastifyPath(route.path),
        handler: async (request, reply) => {
          const response = await route.handle({
            method: request.method,
            path: request.url.split('?', 1)[0] ?? request.url,
            headers: request.headers,
            query: request.query,
            params: request.params,
            body: request.body,
          });

          reply.status(response.status);

          // Fastify sends a string as text/plain. The OpenAPI document says JSON.
          return typeof response.body === 'string'
            ? await reply
                .type('application/json; charset=utf-8')
                .send(JSON.stringify(response.body))
            : await reply.send(response.body);
        },
      });
    }

    if (document !== undefined && options.openapi !== undefined) {
      // eslint-disable-next-line @typescript-eslint/require-await -- Fastify wants a promise-returning handler
      scope.get(options.openapi.path, async () => document);
    }
  });
}
