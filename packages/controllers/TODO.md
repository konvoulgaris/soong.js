# TODO

Open items for `soong-controllers` and `soong-controllers-fastify-adapter`.

## Request info object

Add `SoongRequestInfo` and pass it to handlers and pre-operation middlewares, as `(requestInfo, request)`.

- Another middleware builds it, outside these packages.
- Open: how the adapter gets it (explicit `registerControllers` option, or a fixed request decoration).
- Open: its shape (fixed type, or extended by apps through declaration merging).

v1 has no request info. Handlers are `(request) => Promise<SoongControllerResponse>`.

## OpenAPI components and $ref

v1 inlines every schema into the OpenAPI document. It throws on schemas that need `$ref` (`.meta({ id })` and recursive schemas).

- Open: support them. Collect `$defs` into `components.schemas`, set a `uri` option on `z.toJSONSchema`, and rewrite the refs.
