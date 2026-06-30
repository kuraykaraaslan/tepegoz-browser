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

test('the app launches a window showing the Settings page', async () => {
  const app: ElectronApplication = await electron.launch({ args: [mainEntry], env: guiEnv() });
  try {
    const window = await app.firstWindow();
    // The app shell heading.
    await expect(window.locator('h1')).toHaveText('Tepegöz');
    // The Settings page rendered — proves the preload bridge + prefs/credentials IPC + i18n all work
    // (otherwise the "…" loading fallback would show instead of the page).
    await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(window.getByText('Claude (Anthropic)')).toBeVisible();
  } finally {
    await app.close();
  }
});
