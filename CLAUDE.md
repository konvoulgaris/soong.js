# soong.js

## Versioning Scheme

Zero versioning (0ver). The major version stays at 0 forever.

- Release with `pnpm version patch` or `pnpm version minor`.
- Never run `pnpm version major`.
- Commit all changes first. `pnpm version` fails on a dirty working tree.
- `pnpm version` bumps `package.json`, commits, and tags `vX.Y.Z`.
