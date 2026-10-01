import { plugin as shadcn } from '@shadcn/lint';
import type { ESLint } from 'eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

import { namingConvention } from './base.config.ts';

// Add this after the base config: `defineConfig(base, react)`.
export default defineConfig(
  {
    files: ['**/*.tsx', '**/use-*.ts'],
    plugins: { 'react-hooks': reactHooks as ESLint.Plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Set `settings.shadcn.ui` (design-system component sources) in the consuming project.
    files: ['**/*.tsx'],
    plugins: { shadcn },
    rules: {
      'shadcn/no-restyle': ['error', { allow: ['layout'] }],
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': 'error',
      'shadcn/no-inline-styles': 'error',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/require-static-classes': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      // React components are functions with PascalCase names.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        ...namingConvention,
      ],
      'unicorn/name-replacements': [
        'error',
        { replacements: { props: false, ref: false, args: false } },
      ],
    },
  },
  {
    // Storybook needs default exports.
    files: ['**/*.stories.tsx', '**/.storybook/*.ts'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
);
