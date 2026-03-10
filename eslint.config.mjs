import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const sharedGlobals = {
  console: 'readonly',
  crypto: 'readonly',
  process: 'readonly',
  structuredClone: 'readonly',
};

export default defineConfig(
  globalIgnores([
    'node_modules/**',
    '.git/**',
    '.idea/**',
    '.agents/**',
    '.ai-orchestrator/**',
    'docs/**',
    'tasks/**',
    '**/*.d.ts',
    '**/*.config.js',
    '**/eslint.config.mjs',
  ]),
  {
    ...eslint.configs.recommended,
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ...eslint.configs.recommended.languageOptions,
      globals: sharedGlobals,
    },
  },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      parserOptions: {
        projectService: true,
        sourceType: 'module',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: sharedGlobals,
    },
    rules: {
      'dot-notation': 'off',
      'no-empty-function': 'off',
      'no-implied-eval': 'off',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-useless-constructor': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/dot-notation': 'error',
      '@typescript-eslint/no-implied-eval': 'warn',
      '@typescript-eslint/no-loop-func': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/ban-tslint-comment': 'error',
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false },
      ],
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['arrowFunctions'],
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': 'allow-with-description',
          'ts-check': false,
          minimumDescriptionLength: 5,
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          leadingUnderscore: 'allow',
          selector: ['variable', 'function'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'variable',
          modifiers: ['destructured'],
          format: null,
        },
        {
          selector: 'variable',
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: [
            'is',
            'should',
            'has',
            'can',
            'did',
            'will',
            'IS',
            'SHOULD',
            'HAS',
            'CAN',
            'DID',
            'WILL',
          ],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
        {
          selector: ['typeLike'],
          format: ['PascalCase'],
        },
        {
          selector: ['enum'],
          format: ['PascalCase', 'UPPER_CASE'],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
