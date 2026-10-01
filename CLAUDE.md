# soong.js

## Versioning Scheme

Zero versioning (0ver). The major version stays at 0 forever.

- Release with `pnpm version patch` or `pnpm version minor`.
- Never run `pnpm version major`.
- Commit all changes first. `pnpm version` fails on a dirty working tree.
- `pnpm version` bumps `package.json`, commits, and tags `vX.Y.Z`.

## Verification

Make sure nothing breaks. After every change, run `pnpm check` and read its exit code. After a packaging change, also install the packed tarballs in a clean scratch app. Do not ask first.
