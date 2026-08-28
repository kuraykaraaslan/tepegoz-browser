import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * The recently-closed list, end to end: close a tab, find it by name in the History flyout, click it,
 * get the tab back.
 *
 * Ctrl+Shift+T already reopened the newest closed tab, and that is all it can ever do — it walks the
 * stack blind, one press at a time, with no way to say "that one". This covers the other half: the tab
 * the user can NAME. The two share one list, so the test also pins that they stay in step.
 *
 * The menu is three native windows deep (chrome → hamburger popup → History flyout), which is why the
 * flyout is reached through `app.waitForEvent('window')` rather than a selector: a native popup cannot
 * overflow its parent's bounds, so each level is a real BrowserWindow of its own.
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

test('a closed tab can be found by name in the History menu and reopened', async () => {
  test.setTimeout(120_000);

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><title>Closed Page</title></head><body>ok</body></html>');
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.recently-closed-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    const closedPageTab = window.getByRole('tab', { name: /Closed Page/ });

    // Open the page, then close its tab from the strip's × (the real gesture, and the one that runs the
    // two-pass teardown where the title has to come from the store rather than the dead contents).
    const omnibox = window.getByRole('combobox').first();
    await omnibox.fill(pageUrl);
    await omnibox.press('Enter');
    await expect(closedPageTab).toHaveCount(1);
    await closedPageTab.getByRole('button').last().click();
    await expect(closedPageTab).toHaveCount(0);

    // Hamburger → hover History → the flyout opens as its own window.
    await window.locator('button[aria-haspopup="menu"]').last().click();
    const menu = await app.waitForEvent('window');
    await menu
      .getByRole('menuitem')
      .filter({ hasText: /Geçmiş|History/ })
      .first()
      .hover();
    const flyout = await app.waitForEvent('window');

    // Two rows carry the page: the recently-closed entry (first, above the separator) and the history
    // entry below it. They are different facts — a closed tab is not the same as a visited page — and
    // this count is what would catch the section silently disappearing.
    const rows = flyout.getByRole('menuitem', { name: 'Closed Page' });
    await expect(rows).toHaveCount(2);

    // Taking the recently-closed row brings the tab back and dismisses the whole menu.
    await rows.first().click();
    await expect(closedPageTab).toHaveCount(1);
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* a just-closed Electron can still hold the profile for a moment; the next run clears it */
    }
  }
});
