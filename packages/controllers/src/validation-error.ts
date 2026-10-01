import { z } from 'zod';

const PathSegment = z.union([z.string(), z.number()]);

const Issue = z.looseObject({
  code: z.string(),
  path: z.array(PathSegment),
  message: z.string(),
});

// The body of a 400 response. The core adds it to every route that declares a request.
export const ValidationErrorResponse = z.object({
  issues: z.array(Issue),
});
