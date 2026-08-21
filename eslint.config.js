import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // 生成物・ビルド成果物・依存は lint 対象外
    ignores: [
      'node_modules/**',
      'dist/**',
      'web/dist/**',
      'worker-build/**',
      'deploy/**',
      'coverage/**',
      '*.html',
      'src/generated/**',
      '.wrangler/**',
      '.omo/**',
      '.playwright-mcp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node.js 実行スクリプト（scripts/ 配下 .mjs / .ts）
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      'no-control-regex': 'off',
    },
  },
);
