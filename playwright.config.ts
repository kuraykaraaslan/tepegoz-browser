import { defineConfig } from '@playwright/test';

// E2E uses Playwright's Electron driver (no web browsers needed). Tests launch the BUILT app
// (out/main/index.js) and assert real window behavior.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
