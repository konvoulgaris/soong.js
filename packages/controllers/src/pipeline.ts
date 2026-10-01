import { HttpStatus } from '@konvoulgaris/soong-constants';
import { logger } from '@konvoulgaris/soong-utils';
import type { z } from 'zod';

import type { AnyRoute, RawRequest, ResponseSchemas, SoongControllerResponse } from './types.ts';

const requestTargets = ['params', 'query', 'headers', 'body'] as const;

// Builds the function that runs one route. `declared` is the full set of responses of the route.
// A middleware or handler that throws is not caught. The exception leaves the returned function,
// and the adapter hands it to the error handling of Fastify.
export function createHandle(
  operationId: string,
  definition: AnyRoute,
  declared: ResponseSchemas,
): (raw: RawRequest) => Promise<SoongControllerResponse<unknown>> {
  // The one place where a response is checked. The parsed body is the response, so unknown keys do not leave.
  // `allowed` is the set of statuses that the source of the response may use.
  function finalize(
    response: SoongControllerResponse<unknown>,
    allowed: ResponseSchemas,
  ): SoongControllerResponse<unknown> {
    const result = allowed[response.status]?.safeParse(response.body);

    if (result?.success) {
      return { status: response.status, body: result.data };
    }

    logger.error({
      key: 'RESPONSE_VALIDATION_FAILED',
      reason: result === undefined ? 'undeclared_status' : 'invalid_body',
      operationId,
      status: response.status,
      issues: result?.error.issues ?? [],
    });

    return { status: HttpStatus.InternalServerError, body: undefined };
  }

  return async (raw) => {
    const middlewares = definition.pre ?? [];

    for (const middleware of middlewares) {
      const response = await middleware.run(raw);

      if (response !== undefined) {
        // A middleware response is checked against the full declared set, because it comes from a middleware.
        return finalize(response, declared);
      }
    }

    const parsed: Record<string, unknown> = {};
    const issues: z.core.$ZodIssue[] = [];

    for (const target of requestTargets) {
      const schema = definition.request?.[target];

      if (schema === undefined) {
        continue;
      }

      const result = schema.safeParse(raw[target]);

      if (result.success) {
        parsed[target] = result.data;
      } else {
        issues.push(...result.error.issues);
      }
    }

    if (issues.length > 0) {
      logger.warn({ key: 'REQUEST_VALIDATION_FAILED', operationId, issues });

      // The 400 comes from the framework, so it is checked against the full declared set.
      return finalize({ status: HttpStatus.BadRequest, body: { issues } }, declared);
    }

    // The handler response is checked against `definition.responses` only. The handler cannot return
    // a status that only a middleware declares, or the reserved 400 or 500.
    // `AnyRoute` erases the handler input type to `never`. The schemas above already checked the request at runtime.
    return finalize(await definition.handler(parsed as never), definition.responses);
  };
}
