import { HttpStatus } from '@konvoulgaris/soong-constants';
import { logger } from '@konvoulgaris/soong-utils';
import type { z } from 'zod';

import type { AnyRoute, RawRequest, ResponseSchemas, SoongControllerResponse } from './types.ts';

const requestTargets = ['params', 'query', 'headers', 'body'] as const;

// Builds the function that runs one route. `declared` is the full set of responses of the route.
export function createHandle(
  operationId: string,
  definition: AnyRoute,
  declared: ResponseSchemas,
): (raw: RawRequest) => Promise<SoongControllerResponse<unknown>> {
  // The one place where a response is checked. The parsed body is the response, so unknown keys do not leave.
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

      return finalize({ status: HttpStatus.BadRequest, body: { issues } }, declared);
    }

    return finalize(await definition.handler(parsed as never), definition.responses);
  };
}
