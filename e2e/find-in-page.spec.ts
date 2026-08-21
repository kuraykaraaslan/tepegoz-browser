import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/**
 * Find-in-page, end to end (Phase 2c): the bar opens, the search runs against the active tab's real
 * WebContentsView in the main process, and Chromium's counts travel back to the bar.
 *
 * This test earned its keep. It failed first, and the cause was a silent API inversion in our own
 * code: Electron's `findInPage` option `findNext` means "this request OPENS a find session", not "go
 * to the next match". We sent `findNext: false` to start every search. Chromium answers a follow-up
 * request with no open session by emitting **nothing at all** — no `found-in-page`, no error — so the
 * bar sat at zero and the unit tests, which mock WebContents, happily passed.
 *
 * Located by ROLE and by numeric shape, never by visible text — this file must not fail because the
 * app is running in Turkish.
 */
test('Ctrl+F finds text in the active tab and reports Chromium\u2019s match counts', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><head><title>Find Fixture</title></head><body>' +
        '<p>needle one</p><p>needle two</p><p>needle three</p><p>haystack</p>' +
        '</body></html>',
    );
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.find-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(pageUrl);
    await omnibox.press('Enter');

    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }) =>
                webContents.getAllWebContents().map((w) => w.getURL()).join(' '),
              ),
            '',
          ),
        { timeout: 20_000 },
      )
      .toContain(pageUrl);

    // Not `keyboard.press('Control+f')`: a CDP-injected key never reaches Electron's main-process
    // `before-input-event`, so the shortcut is not exercisable from Playwright (verified: the bar
    // never opens). Everything downstream of the shortcut is what this test covers.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('find:open');
    });

    // Located by ROLE, not by visible text: this file must not fail because the app runs in Turkish.
    // The omnibox is a `combobox`, so the only `textbox` on screen is the find bar's input.
    const findInput = window.getByRole('textbox').first();
    await expect(findInput).toBeVisible();
    await findInput.fill('needle');

    // The counter reads "active/total". Matched by SHAPE so the assertion survives localization.
    await expect
      .poll(async () => (await window.getByText(/^\d+\/\d+$/).allInnerTexts()).join(''), {
        timeout: 30_000,
      })
      .toBe('1/3');

    await findInput.press('Enter');
    await expect
      .poll(async () => (await window.getByText(/^\d+\/\d+$/).allInnerTexts()).join(''), {
        timeout: 30_000,
      })
      .toBe('2/3');

    await findInput.press('Escape');
    await expect(findInput).toBeHidden();
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
