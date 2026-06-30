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

test('the app launches a window showing the Tepegöz heading', async () => {
  const app: ElectronApplication = await electron.launch({ args: [mainEntry], env: guiEnv() });
  try {
    const window = await app.firstWindow();
    await expect(window.locator('h1')).toHaveText('Tepegöz');
    // The preload bridge populated platform (not the "unknown" fallback).
    await expect(window.locator('small')).not.toContainText('unknown');
  } finally {
    await app.close();
  }
});
