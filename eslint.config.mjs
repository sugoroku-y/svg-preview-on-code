// @ts-check
import eslint from '@eslint/js';
import eslintPlugin from '@typescript-eslint/eslint-plugin';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import * as importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import eslintComments from 'eslint-plugin-eslint-comments';

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
      'no-void': [
        'error',
        {
          allowAsStatement: true,
        },
      ],
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
        // デフォルト設定
        ...eslintPlugin.rules['naming-convention'].defaultOptions,
        // カスタマイズ設定
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
      // _で始まる変数/引数等は対象外
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
      // テンプレートリテラルでundefinedやunknownを使えるように
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    // JsDoc不足の警告
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          contexts: ['TSTypeAliasDeclaration'],
        },
      ],
      'jsdoc/require-description': [
        'error',
        {
          contexts: ['FunctionDeclaration', 'TSTypeAliasDeclaration'],
        },
      ],
      'jsdoc/check-tag-names': [
        'error',
        {
          definedTags: ['hidden', 'typeParam', 'remark'],
        },
      ],
    },
  },
  {
    // eslintコメントで無効にした警告には追加のコメントが必要
    files: ['**/*.ts'],
    plugins: {
      'eslint-comments': eslintComments,
    },
    rules: {
      'eslint-comments/no-use': [
        'error',
        {
          allow: [
            'eslint-enable',
            'eslint-disable',
            'eslint-disable-line',
            'eslint-disable-next-line',
          ],
        },
      ],
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/require-description': 'error',
    },
  },
  {
    // インポート順など
    ...importPlugin.flatConfigs?.recommended,
    ...importPlugin.flatConfigs?.typescript,
  },
  {
    rules: {
      'import/no-anonymous-default-export': [
        'error',
        {
          allowObject: true,
        },
      ],
      'import/extensions': ['error', 'never', { json: 'always' }],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/tests/**', '**/testing-library/**'],
          optionalDependencies: false,
        },
      ],
      'import/order': [
        'warn',
        {
          pathGroups: [
            {
              pattern: 'vscode',
              group: 'external',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['vscode'],
          alphabetize: {
            order: 'asc',
          },
          'newlines-between': 'never',
        },
      ],
    },
  },
  // 例外的に無効にする設定
  {
    // テストではjsdocやdependenciesのチェックは不要
    files: ['**/test/*.test.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    ignores: ['out/'],
  },
);
