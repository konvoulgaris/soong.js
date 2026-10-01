# soong.js

An opinionated monorepo of JavaScript packages: my preferred way of doing things in JS projects, from logging to everything else.

Much like [soong](https://github.com/konvoulgaris/soong), the name is a nod to Noonien Soong, the Star Trek: The Next Generation scientist who created the android Data.

## Packages

| Package                                           | Contents                                               |
| ------------------------------------------------- | ------------------------------------------------------ |
| `@konvoulgaris/soong-constants`                   | The `Environment` and `HttpStatus` objects.            |
| `@konvoulgaris/soong-utils`                       | The `logger`, a narrowed pino instance.                |
| `@konvoulgaris/soong-style`                       | The ESLint flat config and the Prettier config.        |
| `@konvoulgaris/soong-controllers`                 | Zod-first route declarations, validation, and OpenAPI. |
| `@konvoulgaris/soong-controllers-fastify-adapter` | Registers the controllers on a Fastify app.            |

## Install

The packages are on GitHub Packages. GitHub does not allow anonymous installs, so you need a token.

1. Create a GitHub personal access token (classic) with the `read:packages` scope.
2. Add the registry and the token to the `.npmrc` file of your project, or of your home directory:

   ```ini
   @konvoulgaris:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

3. Set `GITHUB_TOKEN` to your token in your shell. In CI, set it as a secret.
4. Install the packages you need:

   ```sh
   pnpm add @konvoulgaris/soong-constants @konvoulgaris/soong-utils
   pnpm add @konvoulgaris/soong-controllers @konvoulgaris/soong-controllers-fastify-adapter fastify zod
   pnpm add -D @konvoulgaris/soong-style eslint typescript jiti prettier
   ```

### Use the style package

Create `eslint.config.ts`:

```ts
import config from '@konvoulgaris/soong-style/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(globalIgnores(['dist/']), config, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

Add the Prettier config to `package.json`:

```json
{
  "prettier": "@konvoulgaris/soong-style/prettier"
}
```

For React projects, add `@konvoulgaris/soong-style/eslint-react` after the base config. For Tailwind projects, use `@konvoulgaris/soong-style/prettier-tailwind` in a `prettier.config.js` and install `prettier-plugin-tailwindcss`.

### Use the controllers packages

Declare each route once. The handler is a service-layer function. Its types come from the schemas of the route. `fastify` and `zod` are peer dependencies, so you install them yourself.

```ts
import { HttpStatus } from '@konvoulgaris/soong-constants';
import { defineController, route } from '@konvoulgaris/soong-controllers';
import { registerControllers } from '@konvoulgaris/soong-controllers-fastify-adapter';
import Fastify from 'fastify';
import { z } from 'zod';

const customers = defineController({
  deleteCustomer: route({
    method: 'delete',
    path: '/api/customers/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      [HttpStatus.NoContent]: z.undefined(),
      [HttpStatus.NotFound]: z.object({ key: z.literal('NOT_FOUND') }),
    },
    // customerService is your own service-layer code. Here, delete returns
    // Promise<{ status: 204; body: undefined } | { status: 404; body: { key: 'NOT_FOUND' } }>
    handler: async (request) => customerService.delete(request.params.id),
  }),
});

const app = Fastify();
registerControllers(app, [customers], {
  openapi: { path: '/openapi.json', title: 'Pullbox', version: '1.0.0' },
});
```

- A handler returns `{ status, body }`. TypeScript accepts only the statuses and bodies that the route declares. `z.undefined()` means no body.
- A failed validation gives a 400 with the body `{ issues }`, and the log gets `REQUEST_VALIDATION_FAILED`.
- A response that does not match its schema gives an empty 500, and the log gets `RESPONSE_VALIDATION_FAILED`.
- `pre` middlewares run before validation. They can answer with a declared response, for example a 403.
- The adapter turns only a malformed or empty JSON body into the 400 `{ issues }`. Other Fastify errors (415, 413) and errors that a handler throws go to the error handler of your app.
- `registerControllers` throws at once for these errors in the definitions: a duplicate `operationId`, path placeholders that do not match the params schema, and a reserved or duplicate response status. A clash between the OpenAPI path and a route path shows up when the app becomes ready (`await app.ready()` or `listen`).
- Schemas that need `$ref` are not supported yet. These are a schema with `.meta({ id })` and a recursive schema. The OpenAPI generator throws for them.
- Header names in a `headers` schema must be lower case, because Fastify lower-cases them. Query values arrive as strings, so use `z.coerce` for numbers and booleans.
- The core needs Node 22 or later, because it uses iterator helpers.

## Versioning Scheme

Zero versioning (0ver). The major version stays at 0 forever.

- Release with `pnpm release:patch` or `pnpm release:minor`. They run `pnpm version` and push the commit and the tag.
- Never run `pnpm version major`.
- Commit all changes first. `pnpm version` fails on a dirty working tree.
- `pnpm version` bumps the root and package versions, commits, and tags `vX.Y.Z`.
- CI checks the code and publishes the packages when the tag arrives.

## License

Licensed under the [MIT License](LICENSE) by [Konstantinos Voulgaris](https://github.com/konvoulgaris).
