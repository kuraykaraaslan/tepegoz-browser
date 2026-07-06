import { defineConfig } from 'vitest/config';

/**
 * Root coverage gate (phases/README.md DoD: S80 / B70 / F80 / L80), run as `pnpm coverage` in CI.
 * One vitest pass over every package's unit tests (per-package `turbo run test` stays the day-to-day
 * runner; jsdom tests opt in via their `@vitest-environment` docblock).
 *
 * Named `vitest.coverage.config.ts` ON PURPOSE: vitest walks UP for a `vitest.config.*`, so a plain
 * root config would hijack every package-local `vitest run` (their cwd-relative include would match
 * nothing → "No test files found"). Only `pnpm coverage` loads this file, via --config.
 *
 * Scope is EXPLICIT, not silent: `coverage.include` lists the packages held to the gate today.
 * Excluded (documented, to be burned down):
 *  - packages/persistence — better-sqlite3 is rebuilt per-runtime (Electron ABI locally), so its
 *    tests only run reliably under `turbo run test` in CI; keep it out of this single-pass runner.
 *  - packages/ui — vendored kui-react fork (see packages/ui/_FORK.md), not held to repo gates.
 *  - chrome leaf/i18n-only UI packages (window-controls, history-ui, settings-ui, extensions-ui,
 *    ext-*, browser-menu) — only parity/smoke tests exist so far; add them here as tests land.
 *  - apps/desktop — Electron main/renderer glue; covered by e2e, not unit coverage.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'packages/persistence/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
      include: [
        'packages/browser-chrome/src/**',
        'packages/browser-tools/src/**',
        'packages/capability-plane/src/**',
        'packages/extension-sdk/src/**',
        'packages/journal-tools/src/**',
        'packages/json-store/src/**',
        'packages/libs/src/**',
        'packages/mcp-client/src/**',
        'packages/model-gateway/src/**',
        'packages/nav-toolbar/src/**',
        'packages/navigation/src/**',
        'packages/notifications/src/**',
        'packages/notifications-ui/src/**',
        'packages/omnibox/src/**',
        'packages/orchestrator/src/**',
        'packages/password-core/src/**',
        'packages/password-provider-google-csv/src/**',
        'packages/password-vault/src/**',
        'packages/preferences/src/**',
        'packages/security-policy/src/**',
        'packages/shared-types/src/**',
        'packages/tab-engine/src/**',
        'packages/tab-strip/src/**',
        'packages/tool-executor/src/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts'],
    },
  },
});
