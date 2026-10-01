# soong.js

An opinionated monorepo of JavaScript packages: my preferred way of doing things in JS projects, from logging to everything else.

Much like [soong](https://github.com/konvoulgaris/soong), the name is a nod to Noonien Soong, the Star Trek: The Next Generation scientist who created the android Data.

## Packages

| Package                         | Contents                                        |
| ------------------------------- | ----------------------------------------------- |
| `@konvoulgaris/soong-constants` | The `Environment` object.                       |
| `@konvoulgaris/soong-utils`     | The `logger`, a narrowed pino instance.         |
| `@konvoulgaris/soong-style`     | The ESLint flat config and the Prettier config. |

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

## Versioning Scheme

Zero versioning (0ver). The major version stays at 0 forever.

- Release with `pnpm version patch` or `pnpm version minor`.
- Never run `pnpm version major`.
- Commit all changes first. `pnpm version` fails on a dirty working tree.
- `pnpm version` bumps the root and package versions, commits, and tags `vX.Y.Z`.
- Push the commit and the tag with `git push --follow-tags`. CI checks the code and publishes the packages.

## License

Licensed under the [MIT License](LICENSE) by [Konstantinos Voulgaris](https://github.com/konvoulgaris).
