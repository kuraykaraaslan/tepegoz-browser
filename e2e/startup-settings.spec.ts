import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Two preferences read at launch, end to end: "open a specific set of pages" and "show the Home button".
 *
 * Both are unit-tested against doubles; what only a real launch proves is that the persisted value
 * reaches the code that acts on it — the preferences file is parsed, `bootstrapTabs` reads
 * `startupTabs`/`startupPages`, and the chrome reads `showHomeButton` — with the first page focused and
 * the rest behind it. The keyboard-driven features (Ctrl+Tab, Ctrl+1..9) are NOT here: Playwright cannot
 * deliver a key to Electron's `before-input-event` (see the note in phase-2c), so they are covered by the
 * unit suites that drive `handleWindowShortcut` directly.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server: Server = createServer((req, res) => {
    const name = (req.url ?? '/').replace(/\W/g, '') || 'root';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>Page ${name}</title><body>${name}</body>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    return await fn(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function launchWith(
  profileName: string,
  prefs: Record<string, unknown>,
  run: (app: ElectronApplication) => Promise<void>,
): Promise<void> {
  const profileDir = join(process.cwd(), profileName);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify(prefs));
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    await run(app);
  } finally {
    await app.close().catch(() => undefined);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* a just-closed Electron can still hold the profile for a moment; the next run clears it */
    }
  }
}

test('"open specific pages" opens the listed pages at launch, the first focused', async () => {
  test.setTimeout(150_000);
  await withServer(async (base) => {
    await launchWith(
      '.startup-pages-profile',
      { startupTabs: 'pages', startupPages: [`${base}/one`, `${base}/two`] },
      async (app) => {
        const window = await app.firstWindow();
        const first = window.getByRole('tab', { name: /Page one/ });
        const second = window.getByRole('tab', { name: /Page two/ });
        await expect(first).toHaveCount(1);
        await expect(second).toHaveCount(1);
        await expect(first).toHaveAttribute('aria-selected', 'true');
        await expect(second).toHaveAttribute('aria-selected', 'false');
      },
    );
  });
});

test('"show Home button" off removes the Home button, and it is there by default', async () => {
  test.setTimeout(150_000);
  const home = (w: import('@playwright/test').Page) =>
    w.getByRole('button', { name: /^(Home|Ana sayfa)$/ });

  await launchWith('.home-default-profile', {}, async (app) => {
    const window = await app.firstWindow();
    await expect(window.getByRole('combobox').first()).toBeVisible();
    await expect(home(window)).toHaveCount(1);
  });

  await launchWith('.home-hidden-profile', { showHomeButton: false }, async (app) => {
    const window = await app.firstWindow();
    await expect(window.getByRole('combobox').first()).toBeVisible();
    await expect(home(window)).toHaveCount(0);
  });
});
