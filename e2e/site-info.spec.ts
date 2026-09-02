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
 * Site Info bubble, end to end (Phase 2c / ADR-0044): an `http://` page drives the leading omnibox
 * control to its "Not secure" state — the verdict is classified in main and pushed on
 * `TabsState.activeSecurityLevel`, not decided in the renderer — and clicking it opens the native
 * `site-info` popup window over the live page.
 *
 * Located by role + numeric/structural shape, never by Turkish-sensitive visible text where it can be
 * helped; the one text check (`Not secure`) is the specific behaviour under test and is asserted in
 * English because the profile is created empty (default locale).
 */
test('the omnibox marks an http page "Not secure" and opens the Site Info popup', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Insecure Fixture</title><p>plain http</p>');
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.site-info-profile');
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

    // The leading control turns into a "Not secure" button once the state push lands.
    const siteInfoButton = window.getByRole('button', { name: /site info|site bilg/i });
    await expect(siteInfoButton).toBeVisible({ timeout: 15_000 });
    await expect(window.getByText('Not secure')).toBeVisible();

    const windowsBefore = app.windows().length;
    await siteInfoButton.click();

    // The bubble is a native popup window (PopupWindowManager), so a new window appears.
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThan(windowsBefore);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
