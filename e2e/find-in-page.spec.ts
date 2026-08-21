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
 * Find-in-page, end to end (Phase 2c) — **currently `fixme`, and the reason is a measurement, not a
 * guess.**
 *
 * What was measured on Electron 33.4.11 under Playwright `_electron`:
 *  - The bar opens, the query reaches it, and `find:start` reaches main. That half works.
 *  - `webContents.findInPage()` then emits **no `found-in-page` event at all**, so the counters stay
 *    at zero and the bar reads "No results".
 *  - This is NOT our plumbing. Calling `findInPage` directly from the main process, with no app code
 *    involved, is equally silent — on the tab's `WebContentsView` *and* on the chrome
 *    `BrowserWindow`'s own webContents, with `show()`, `focus()` and `webContents.focus()` forced.
 *
 * The most likely explanation is the automation harness itself: Playwright drives Electron over CDP,
 * and a webContents with a debugger attached is a known source of find-in-page misbehaviour. That
 * would mean the feature is fine for real users and only untestable this way. **It is a hypothesis —
 * it has not been confirmed**, so this test stays visible as `fixme` rather than being deleted, and
 * the phase file does not claim the feature is verified.
 *
 * A second, separate constraint found here: `keyboard.press('Control+f')` does NOT reach Electron's
 * main-process `before-input-event`, so the Ctrl+F shortcut cannot be driven from Playwright at all.
 * The test opens the bar by sending `find:open` directly, which is why the keystroke is not asserted.
 *
 * To un-fixme this: confirm find-in-page against a build driven WITHOUT a CDP attachment (a manual
 * run, or a harness that does not attach a debugger to the searched webContents).
 */
test.fixme('Ctrl+F finds text in the active tab and reports Chromium\u2019s match counts', async () => {
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

    // Not `keyboard.press('Control+f')` — see the note above: CDP-injected keys never reach
    // `before-input-event`, so the shortcut itself is not exercisable from here.
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
        timeout: 15_000,
      })
      .toBe('1/3');

    await findInput.press('Enter');
    await expect
      .poll(async () => (await window.getByText(/^\d+\/\d+$/).allInnerTexts()).join(''), {
        timeout: 15_000,
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
