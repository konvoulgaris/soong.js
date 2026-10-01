import type {
  AnyRoute,
  Controller,
  RequestSchemas,
  ResponseSchemas,
  RouteDefinition,
} from './types.ts';

// The generic parameters are inferred from `request` and `responses`, which types the handler.
export function route<
  // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- the empty default means a route with no request has no keys
  const Q extends RequestSchemas = Record<never, never>,
  const R extends ResponseSchemas = ResponseSchemas,
>(definition: RouteDefinition<Q, R>): AnyRoute {
  return definition;
}

export function defineController<const C extends Controller>(controller: C): C {
  return controller;
}
