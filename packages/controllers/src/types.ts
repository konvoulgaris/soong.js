import type { HttpStatus } from '@konvoulgaris/soong-constants';
import type { z } from 'zod';

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

export type SoongControllerResponse<T = object> = { status: HttpStatusCode; body: T };

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// All values are unvalidated. Header names are lower case.
export type RawRequest = {
  method: string;
  path: string;
  headers: Record<string, unknown>;
  query: unknown;
  params: unknown;
  body: unknown;
};

export type RequestSchemas = {
  params?: z.ZodObject;
  query?: z.ZodObject;
  headers?: z.ZodObject;
  body?: z.ZodType;
};

export type ResponseSchemas = Partial<Record<HttpStatusCode, z.ZodType>>;

// Only the declared keys exist, typed as z.output. A route with no request has no keys.
// eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- the empty default means a route with no request has no keys
export type ParsedRequest<Q extends RequestSchemas = Record<never, never>> = {
  [K in keyof Q]-?: Q[K] extends z.ZodType ? z.output<Q[K]> : never;
};

// One variant per declared status. The body is typed as z.input. The wire body is z.output.
export type RouteResult<R extends ResponseSchemas> = {
  [S in keyof R]-?: R[S] extends z.ZodType
    ? SoongControllerResponse<z.input<R[S]>> & { status: S }
    : never;
}[keyof R];

export type ServiceLayerHandler<T, R> = (request: T) => Promise<R>;

export type PreOperationMiddleware<R extends ResponseSchemas> = {
  responses: R;
  run: (request: RawRequest) => Promise<RouteResult<R> | undefined>;
};

// A route stores its middlewares with this erased type. A generic PreOperationMiddleware<R> is not assignable across different R.
export type AnyPreOperationMiddleware = {
  responses: ResponseSchemas;
  run: (request: RawRequest) => Promise<SoongControllerResponse<unknown> | undefined>;
};

export type RouteDefinition<Q extends RequestSchemas, R extends ResponseSchemas> = {
  method: HttpMethod;
  path: string;
  request?: Q;
  responses: R;
  pre?: AnyPreOperationMiddleware[];
  handler: ServiceLayerHandler<ParsedRequest<Q>, RouteResult<R>>;
};

// The erased type of a route. The handler takes `never`, so a handler of any request type is assignable.
export type AnyRoute = Omit<RouteDefinition<RequestSchemas, ResponseSchemas>, 'handler'> & {
  handler: ServiceLayerHandler<never, SoongControllerResponse<unknown>>;
};

export type Controller = Record<string, AnyRoute>;
