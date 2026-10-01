import config from '@konvoulgaris/soong-style/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(globalIgnores(['dist/', 'packages/*/dist/', '.worktrees/']), config, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
