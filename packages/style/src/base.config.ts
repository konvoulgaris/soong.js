import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export const namingConvention = [
  { selector: 'default', format: ['camelCase'] },
  {
    selector: 'variable',
    modifiers: ['const'],
    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
  },
  { selector: 'property', format: ['camelCase', 'PascalCase'] },
  { selector: 'import', format: ['camelCase', 'PascalCase'] },
  { selector: 'typeLike', format: ['PascalCase'] },
  // eslint-disable-next-line unicorn/no-null -- the rule's API requires null
  { selector: 'property', modifiers: ['requiresQuotes'], format: null },
];

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
      '@stylistic': stylistic,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'SwitchStatement',
          message: 'Use an object map or an if chain ending in assertNever.',
        },
        {
          selector:
            'MethodDefinition[static=true] ThisExpression, PropertyDefinition[static=true] ThisExpression, StaticBlock ThisExpression',
          message:
            'Use the class name, not `this`, in a static member. A static method passed as a callback loses `this`.',
        },
      ],
      '@eslint-community/eslint-comments/require-description': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'do'] },
        { blankLine: 'always', prev: ['if', 'for', 'while', 'do'], next: '*' },
      ],
      '@typescript-eslint/member-ordering': 'error',
      // Services are classes with only static methods.
      'unicorn/class-reference-in-static-methods': 'off',
      'unicorn/no-static-only-class': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowStaticOnly: true }],
      '@typescript-eslint/return-await': ['error', 'always'],
      'func-style': ['error', 'declaration'],
      'prefer-arrow-callback': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      'no-console': 'error',
      'no-nested-ternary': 'error',
      '@typescript-eslint/naming-convention': ['error', ...namingConvention],
      'no-plusplus': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-param-reassign': ['error', { props: true }],
      'no-implicit-coercion': 'error',
      eqeqeq: ['error', 'always'],
      'max-depth': ['error', 3],
      'max-params': ['error', 3],
      complexity: ['error', 10],
    },
  },
  {
    files: ['**/*.config.ts'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  prettier,
  {
    // eslint-config-prettier turns curly off. The 'all' option does not conflict with Prettier.
    rules: {
      curly: ['error', 'all'],
    },
  },
);
