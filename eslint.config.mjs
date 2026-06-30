// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/scripts/**',
      'e2e/**',
      '**/*.config.*',
      '**/*.cjs',
      // Vendored KUIreact fork — drift-tracked in packages/ui/_FORK.md, not restyled to our rules.
      'packages/ui/src/modules/**',
      'packages/ui/src/libs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // internal-ai-rules: no floating promises (correctness)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
