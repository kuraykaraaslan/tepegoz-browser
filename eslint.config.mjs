// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

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
  // i18n (internal-ai-rules: NO hardcoded user-facing strings). Enforced on React surfaces (.tsx):
  // `jsx-text-only` flags literal TEXT rendered between JSX tags (what the user reads) — not className,
  // ids, aria/test attributes, or code strings — so every visible string must come from a dict (useT).
  {
    files: ['**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
  // Allow-list: dictionaries (the SOURCE of strings), tests, and constant message files legitimately
  // contain literals — the rule would be circular there.
  {
    files: [
      '**/i18n/**',
      '**/locales/**',
      '**/*.messages.ts',
      '**/messages.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },
);
