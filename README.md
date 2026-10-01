# soong.js

An opinionated monorepo of JavaScript packages: my preferred way of doing things in JS projects, from logging to everything else.

Much like [soong](https://github.com/konvoulgaris/soong), the name is a nod to Noonien Soong, the Star Trek: The Next Generation scientist who created the android Data.

## Versioning Scheme

Zero versioning (0ver). The major version stays at 0 forever.

- Release with `pnpm version patch` or `pnpm version minor`.
- Never run `pnpm version major`.
- Commit all changes first. `pnpm version` fails on a dirty working tree.
- `pnpm version` bumps `package.json`, commits, and tags `vX.Y.Z`.

## License
Licensed under the [MIT License](LICENSE) by [Konstantinos Voulgaris](https://github.com/konvoulgaris).
