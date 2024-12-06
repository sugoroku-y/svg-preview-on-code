import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',
      'comma-dangle': ['error', 'always-multiline'],
      quotes: ['error', 'single'],
      'require-await': 'off',
    },
  },
  {
    files: ['**/*.ts'],

    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },

    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        // 省略したときのデフォルト設定
        // ./node_modules/@typescript-eslint/eslint-plugin/dist/rules/naming-convention.js:11 より
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: 'default',
          trailingUnderscore: 'allow',
        },
        {
          format: ['camelCase', 'PascalCase'],
          selector: 'import',
        },
        {
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          selector: 'variable',
          trailingUnderscore: 'allow',
        },
        {
          format: ['PascalCase'],
          selector: 'typeLike',
        },
        // 以降はカスタマイズ設定
        {
          // クォートする必要のあるプロパティは命名規則から除外
          selector: ['objectLiteralProperty', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
        {
          // クラスの静的で参照専用のプロパティはPascalCaseもしくはUPPER_CASE
          selector: ['classProperty'],
          format: ['PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
          modifiers: ['readonly', 'static'],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreIIFE: true,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    ignores: ['out/'],
  },
);
