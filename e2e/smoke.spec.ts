import { resolve } from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

const mainEntry = resolve(process.cwd(), 'apps/desktop/out/main/index.js');

/** A clean env without ELECTRON_RUN_AS_NODE (some shells set it, which makes Electron run as Node). */
function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('the app launches a browser window with chrome and a loaded tab', async () => {
  const app: ElectronApplication = await electron.launch({ args: [mainEntry], env: guiEnv() });
  try {
    const window = await app.firstWindow();
    // Brand in the custom title bar.
    await expect(window.locator('h1')).toHaveText('Tepegöz');
    // The browser chrome rendered: an omnibox and at least one tab.
    await expect(window.locator('input[type="text"]')).toBeVisible();
    await expect(window.locator('[role="tab"]').first()).toBeVisible();
    // The first tab loads a real page in its WebContentsView — its title comes back over IPC
    // (proves the chrome ↔ main ↔ browsing-view wiring end to end). Two web contents exist.
    await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => window.locator('[role="tab"]').first().innerText())
      .toContain('DuckDuckGo');
  } finally {
    await app.close();
  }
});
