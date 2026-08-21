import { defineConfig } from 'vitest/config';

/**
 * Root coverage gate, run as `pnpm coverage` in CI. One vitest pass over every package's unit tests
 * (per-package `turbo run test` stays the day-to-day runner; jsdom tests opt in via their
 * `@vitest-environment` docblock).
 *
 * Named `vitest.coverage.config.ts` ON PURPOSE: vitest walks UP for a `vitest.config.*`, so a plain
 * root config would hijack every package-local `vitest run` (their cwd-relative include would match
 * nothing → "No test files found"). Only `pnpm coverage` loads this file, via --config.
 *
 * SCOPE: every package that ships unit tests. It used to list 28 of them, which is the failure mode a
 * coverage gate is most prone to — the boundary drawn around the code that already passes. Left out
 * were `credential-vault` (the key crypto), `human-input`, `notary`, `macro-engine`, `http` and
 * `agent-runtime`, so the number said "80%" about a scope chosen to say 80%.
 *
 * Two exclusions remain, and both are mechanical rather than discretionary:
 *  - `packages/persistence` — better-sqlite3 is rebuilt per-runtime (Electron ABI locally), so its
 *    tests cannot run in this single Node pass. They run under `pnpm test:electron`.
 *  - `packages/ui` — vendored kui-react fork (see packages/ui/_FORK.md), explicitly not repo code.
 *
 * THRESHOLDS are the measured floor of the widened scope, not an aspiration. Widening the scope
 * necessarily lowered the number: the same gate now covers ~2x the code. Ratchet them UP as coverage
 * lands; never widen the exclusion list to protect a number.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'packages/persistence/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Measured floor on 2026-08-21 after the Electron 43 upgrade: S78.95 / B85.87 / F85.76 / L78.95.
      // Measured on a CLEAN tree, which is the only number CI can reproduce — measuring with
      // work-in-progress present reads ~0.15 high and puts the gate permanently just out of reach.
      // Up from S77.90 / F83.84 because the SQLite-backed suites stopped skipping: the on-disk addon had
      // been built for the Electron ABI, so 63 persistence tests and the bookmarks store tests had been
      // silently sitting out every run. 1845 tests, 0 skipped.
      // Worth reading against the gate it replaces (S80 / B70 / F80 / L80 over 28 packages): doubling
      // the scope cost 2 points of statements and RAISED the branch bar by 15, because B70 was slack
      // enough that no package was ever held to it. Ratchet up; never widen `exclude` to protect these.
      thresholds: { statements: 78, branches: 85, functions: 85, lines: 78 },
      include: [
        'packages/agent-eval/src/**',
        'packages/agent-runtime/src/**',
        'packages/auth-prompt-ui/src/**',
        'packages/bookmarks/src/**',
        'packages/bookmarks-bar/src/**',
        'packages/bookmarks-ui/src/**',
        'packages/browser-chrome/src/**',
        'packages/browser-menu/src/**',
        'packages/browser-tools/src/**',
        'packages/capability-plane/src/**',
        'packages/cert-warning-ui/src/**',
        'packages/clipboard/src/**',
        'packages/credential-vault/src/**',
        'packages/downloads/src/**',
        'packages/downloads-ui/src/**',
        'packages/extension-catalog/src/**',
        'packages/extension-host/src/**',
        'packages/extension-sdk/src/**',
        'packages/extensions-ui/src/**',
        'packages/file-operations/src/**',
        'packages/find-bar/src/**',
        'packages/history-ui/src/**',
        'packages/http/src/**',
        'packages/human-input/src/**',
        'packages/i18n/src/**',
        'packages/journal-tools/src/**',
        'packages/json-store/src/**',
        'packages/libs/src/**',
        'packages/local-inference/src/**',
        'packages/macro-engine/src/**',
        'packages/markdown/src/**',
        'packages/mcp-client/src/**',
        'packages/model-catalog/src/**',
        'packages/model-gateway/src/**',
        'packages/nav-toolbar/src/**',
        'packages/navigation/src/**',
        'packages/newtab-ui/src/**',
        'packages/notary/src/**',
        'packages/notifications/src/**',
        'packages/notifications-ui/src/**',
        'packages/omnibox/src/**',
        'packages/onboarding-ui/src/**',
        'packages/orchestrator/src/**',
        'packages/page-context-menu/src/**',
        'packages/password-core/src/**',
        'packages/password-provider-google-csv/src/**',
        'packages/password-ui/src/**',
        'packages/password-vault/src/**',
        'packages/preferences/src/**',
        'packages/recipe-compiler/src/**',
        'packages/screenshots/src/**',
        'packages/security-policy/src/**',
        'packages/settings-ui/src/**',
        'packages/shared-types/src/**',
        'packages/tab-engine/src/**',
        'packages/tab-strip/src/**',
        'packages/tasks/src/**',
        'packages/tool-executor/src/**',
        'packages/uploads/src/**',
        'packages/uploads-ui/src/**',
        'packages/web-tools/src/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts'],
    },
  },
});
