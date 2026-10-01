import type { z } from 'zod';

import type { HttpStatusCode, ResponseSchemas } from './types.ts';

// Object.entries gives string keys. This returns the statuses as numbers.
export function statusEntries(responses: ResponseSchemas): [HttpStatusCode, z.ZodType][] {
  return (Object.entries(responses) as [string, z.ZodType][]).map(([status, schema]) => [
    Number(status) as HttpStatusCode,
    schema,
  ]);
}
