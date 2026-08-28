import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * A `tepegoz://` page must follow a preference changed from ANOTHER surface — live, without a reload.
 *
 * The theme is the visible case and the reported bug: pick a colour anywhere but on the settings page
 * itself (the chrome, a popup, a second window) and the open settings page stayed in the OLD colour
 * while the chrome around it changed instantly. Root cause was one line in `broadcastPublicSettings`:
 * it iterated `BrowserWindow.getAllWindows()`, and since Faz 2/3 of `protocol-tepegoz-pages.md` an
 * internal page is a `WebContentsView` inside a tab, not a window. Every internal page subscribed to
 * `onPublicSettingsChanged` and none of them could ever receive it.
 *
 * Asserted on `--surface-base` — the inline CSS variable `applyTheme` writes onto `<html>` — because
 * that is the thing that was actually stale on screen, not merely the prefs value behind it.
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

test('a theme change made outside tepegoz://settings repaints the open settings page', async () => {
  const profileDir = join(process.cwd(), '.tepegoz-live-prefs-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en","themeColor":"#0d7377"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    const omnibox = window.getByRole('combobox').first();
    await omnibox.fill('tepegoz://settings');
    await omnibox.press('Enter');

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

    const surfaceBase = (): Promise<string> =>
      pollEvaluate(
        () =>
          app.evaluate(({ webContents }, id) => {
            const wc = webContents.fromId(id);
            if (wc === undefined || wc.isDestroyed()) return '';
            return wc.executeJavaScript(
              "document.documentElement.style.getPropertyValue('--surface-base')",
            ) as Promise<string>;
          }, settingsId),
        '',
      );

    // The page painted the persisted colour on load — the baseline the live change has to move.
    await expect.poll(surfaceBase, { timeout: 20_000 }).toBe('#0d7377');

    // Change it from the CHROME document, i.e. a different surface than the one under test.
    await app.evaluate(({ webContents }) => {
      const chrome = webContents.getAllWebContents().find((w) => w.getURL().startsWith('file:'));
      return chrome?.executeJavaScript(
        "window.tepegoz.updatePreferences({ themeColor: '#4c1d95' }).then(() => true)",
      );
    });

    await expect.poll(surfaceBase, { timeout: 10_000 }).toBe('#4c1d95');
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
