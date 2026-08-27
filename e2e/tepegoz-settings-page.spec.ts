import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * `tepegoz://settings` as a REAL page (phases/tracks/protocol-tepegoz-pages.md, Faz 2). The acceptance
 * criterion the plan names explicitly: a right-click on the settings page fires the SAME native
 * `context-menu` event a browsed web page gets — proof that it is a real `WebContentsView`, not the
 * chrome-rendered React overlay it used to be (which never got a `context-menu` event at all).
 *
 * Getting here required root-causing a real Electron bug: subresource requests to this scheme never
 * reach the protocol handler at all. `internal-pages/protocol.ts` works around it by inlining the whole
 * bundle into one self-contained document — see that file's doc comment for the investigation.
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

test('tepegoz://settings loads as a real page and its right-click opens the native page context menu', async () => {
  const profileDir = join(process.cwd(), '.tepegoz-settings-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // Drive a real navigation to the internal page, exactly like a user typing it.
    const omnibox = window.getByRole('combobox').first();
    await omnibox.fill('tepegoz://settings');
    await omnibox.press('Enter');

    // The settings tab is backed by a REAL WebContentsView loaded at tepegoz://settings — asked in
    // MAIN, not through `app.windows()` (a tab is a WebContentsView, not a BrowserWindow).
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
      .toContain('tepegoz://settings');

    const settingsId = await app.evaluate(({ webContents }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL().startsWith('tepegoz://settings'));
      return wc?.id ?? -1;
    });
    expect(settingsId).toBeGreaterThan(-1);

    // The bundle actually mounted real content — not a blank document — before the right-click is
    // dispatched against it.
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }, id) => {
                const wc = webContents.fromId(id);
                if (wc === undefined || wc.isDestroyed()) return -1;
                return wc.executeJavaScript('document.body.innerText.length');
              }, settingsId),
            -1,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    // A privileged IPC call actually resolves from this page — not just "some text rendered". A
    // getPreferences() call rejected by the IPC sender allow-list (an untrusted-sender 403) leaves
    // SettingsPageSurface stuck on its own "…" loading fallback forever, which the innerText check above
    // cannot tell apart from real content (found 2026-08-27: `isTrustedAppUrl` never learned the
    // `tepegoz://` scheme, so every real page's data fetch silently failed this exact way).
    const bridgeOk = await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id);
      if (wc === undefined || wc.isDestroyed()) return false;
      return wc.executeJavaScript('window.tepegoz.getPreferences().then(() => true, () => false)');
    }, settingsId);
    expect(bridgeOk).toBe(true);

    // Right-click the page (main-process input injection — no live cursor needed) and wait for the
    // Chrome-style page context menu popup (`?surface=page-context-menu`) that only opens in response to
    // a real `context-menu` event on a `WebContentsView`.
    const popupOpened = app.waitForEvent('window');
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id);
      wc?.sendInputEvent({ type: 'mouseDown', button: 'right', x: 40, y: 40, clickCount: 1 });
      wc?.sendInputEvent({ type: 'mouseUp', button: 'right', x: 40, y: 40, clickCount: 1 });
    }, settingsId);
    const popup = await popupOpened;
    expect(popup.url()).toContain('surface=page-context-menu');
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
