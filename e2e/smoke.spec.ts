import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * Launch the app DIRECTORY, not `out/main/index.js`.
 *
 * Electron sets `getAppPath()` to the folder of whatever it was handed, so passing the built entry file
 * pointed it at `out/main/` — where `resources/extensions.catalog.json` does not live. Startup then
 * failed before a window ever opened ("Failed to read extension catalog"), and the only symptom was a
 * `firstWindow()` timeout. Handing it the app directory reproduces what both `pnpm dev` and a packaged
 * build do, which is also what `spike-parked-render.spec.ts` settled on.
 */
const appDir = resolve(process.cwd(), 'apps/desktop');

/** A clean env without ELECTRON_RUN_AS_NODE (some shells set it, which makes Electron run as Node). */
function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('the app launches a browser window with chrome and a loaded tab', async () => {
  // A LOCAL page rather than a live site: the point of this test is the chrome ↔ main ↔ WebContentsView
  // wiring, and pinning that to someone else's uptime makes a green run mean less, not more.
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><head><title>Tepegoz Smoke Page</title></head><body>ok</body></html>',
    );
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  // Isolated profile: a temp --user-data-dir with a preferences.json present but WITHOUT
  // `onboardingCompleted` → PreferenceStore treats it as already onboarded (see preference-store.ts).
  // Without this the smoke runs against whatever profile the developer happens to have.
  const profileDir = join(process.cwd(), '.smoke-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    // The browser chrome rendered. Located by ROLE, not by visible text: this file must not fail
    // because the app is running in Turkish.
    await expect(window.getByRole('banner')).toBeVisible();
    await expect(window.locator('[role="tab"]').first()).toBeVisible();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();

    // Drive a real navigation from the omnibox and wait for the TITLE to come back on the tab strip.
    // That round trip is the actual claim: keystrokes reach main, main navigates a WebContentsView,
    // and the view's title finds its way back to the chrome over IPC.
    await omnibox.fill(pageUrl);
    await omnibox.press('Enter');

    // The page really is loaded in its own web contents. Asked in MAIN rather than through
    // `app.windows()`, which only surfaces BrowserWindows — a tab is a WebContentsView, so counting
    // Playwright windows would be counting the wrong thing (and used to make this test lie).
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }) =>
                webContents
                  .getAllWebContents()
                  .map((w) => w.getURL())
                  .join(' '),
              ),
            '',
          ),
        { timeout: 20_000 },
      )
      .toContain(pageUrl);
    // ANY tab, not the first: navigating from the internal new-tab page opens the web page in its own
    // tab rather than replacing an internal one.
    await expect
      .poll(async () => (await window.locator('[role="tab"]').allInnerTexts()).join(' | '), {
        timeout: 20_000,
      })
      .toContain('Smoke');
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
