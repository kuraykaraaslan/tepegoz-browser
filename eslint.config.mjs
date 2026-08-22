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
  // ids, or code strings — so every visible string must come from a dict (useT).
  {
    files: ['**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
  // …and the attributes a SCREEN READER reads out. `jsx-text-only` deliberately skips every attribute,
  // which is right for `className`/`id` and wrong for these: `aria-label`, `alt`, `title` and
  // `placeholder` are user-facing TEXT that simply is not visible to a sighted reviewer. Leaving them
  // unchecked while Phase 1a claims WCAG 2.2 AA and "Turkish first-class" meant a blind Turkish user
  // could hear English controls with every gate green.
  //
  // Expressed as `no-restricted-syntax` rather than by widening the i18next rule to `jsx-only`: that
  // mode also flags `dict.someKey.replace('{site}', value)` and `language ?? 'code'`, which are correct
  // code — 42 of its 44 findings here were false. A rule that is 95% noise gets disabled, not obeyed.
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            // `Literal[value!='']` matters: `alt=""` is the CORRECT way to mark an image decorative
            // (a favicon next to its own label), and there is nothing there to translate. Flagging it
            // would push people toward inventing alt text for decoration, which is worse for a screen
            // reader than the empty string.
            "JSXAttribute[name.name=/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|alt|title|placeholder)$/] > Literal[value!='']",
          message:
            'User-facing attribute text must come from a dictionary (useT), not a literal — a screen ' +
            'reader reads these out, so an English literal here is an untranslated control.',
        },
      ],
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
      'no-restricted-syntax': 'off',
    },
  },
  // The vendored kui-react fork is not repo code and is not held to repo gates (packages/ui/_FORK.md).
  {
    files: ['packages/ui/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
