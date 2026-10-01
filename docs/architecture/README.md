# Architecture

This folder records the decisions behind soong.js.

## Superpowers files are not tracked

The Superpowers specs and plans in `docs/superpowers/` and `.superpowers/` are local working notes. They are not committed. The architecture docs in this folder record the decisions that matter.

Three things enforce this:

- `.gitignore` lists `docs/superpowers/` and `.superpowers/`, so git never offers those files for staging.
- `.githooks/pre-commit` stops a commit that adds or changes anything under `docs/superpowers/`. This catches a file that someone force-adds with `git add -f`. It checks only that folder, not `.superpowers/`.
- The `prepare` script in `package.json` runs `git config core.hooksPath .githooks` on `pnpm install`. This turns the hook on for every clone.
