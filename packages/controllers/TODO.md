# TODO

Open items for `soong-controllers` and `soong-controllers-fastify-adapter`.

## Request info object

Add `SoongRequestInfo` and pass it to handlers and pre-operation middlewares, as `(requestInfo, request)`.

- Another middleware builds it, outside these packages.
- Open: how the adapter gets it (explicit `registerControllers` option, or a fixed request decoration).
- Open: its shape (fixed type, or extended by apps through declaration merging).

v1 has no request info. Handlers are `(request) => Promise<SoongControllerResponse>`.
