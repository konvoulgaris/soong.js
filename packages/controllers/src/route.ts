import type {
  AnyRoute,
  Controller,
  NoRequest,
  RequestSchemas,
  ResponseSchemas,
  RouteDefinition,
} from './types.ts';

// The generic parameters are inferred from `request` and `responses`, which types the handler.
export function route<
  const Q extends RequestSchemas = NoRequest,
  const R extends ResponseSchemas = ResponseSchemas,
>(definition: RouteDefinition<Q, R>): AnyRoute {
  return definition;
}

export function defineController<const C extends Controller>(controller: C): C {
  return controller;
}
