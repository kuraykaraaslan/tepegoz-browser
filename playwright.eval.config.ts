import { defineConfig } from '@playwright/test';

// AI-1 eval harness (separate from the e2e config). Drives the BUILT app (out/main/index.js) via the
// Electron driver, one scenario at a time, and emits the metrics report. Long timeout — each scenario
// launches the app. Kept out of `./e2e` so `pnpm e2e` and `pnpm eval` never collect each other's specs.
export default defineConfig({
  testDir: './packages/agent-eval/src',
  testMatch: '**/*.eval.ts',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
