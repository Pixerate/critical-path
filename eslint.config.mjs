import tseslint from 'typescript-eslint';

const crossPackagePatterns = [
  '../../core*',
  '../../../core*',
  '../../server*',
  '../../../server*',
  '../../client*',
  '../../../client*',
  '../../mcp*',
  '../../../mcp*',
  '../../react*',
  '../../svelte*',
];

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: crossPackagePatterns,
              message: 'Use canonical @critical-path/* workspace imports instead of relative cross-package paths.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/{core,server,client,mcp}/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Headless packages must not import React.' },
            { name: 'react-dom', message: 'Headless packages must not import react-dom.' },
            { name: 'svelte', message: 'Headless packages must not import Svelte.' },
          ],
          patterns: [
            {
              group: crossPackagePatterns,
              message: 'Use canonical @critical-path/* workspace imports instead of relative cross-package paths.',
            },
            {
              group: ['svelte/*', '@critical-path/react*', '@critical-path/svelte*'],
              message: 'Headless packages must not import UI frameworks or UI bindings.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/{react,svelte}/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: crossPackagePatterns,
              message: 'Use canonical @critical-path/* workspace imports instead of relative cross-package paths.',
            },
            {
              group: ['@critical-path/server*', 'node:*'],
              message: 'UI packages must not import @critical-path/server or Node built-in modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/mcp/src/tools/outputs.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='z'][callee.property.name='object']:not(CallExpression[callee.property.name='passthrough'] > MemberExpression.callee > CallExpression)",
          message:
            'MCP output schemas in outputs.ts must use obj(...) or chain .passthrough() on z.object(...).',
        },
      ],
    },
  },
];
