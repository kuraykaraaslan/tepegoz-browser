import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * "Pre-resolve addresses of linked pages", end to end: the setting changes the response header Chromium
 * reads to decide whether to look up a page's links ahead of time, and it does so LIVE.
 *
 * A same-origin `fetch` from inside the page reads every response header, including the one the browser
 * stamped onto the response on its way in (`X-DNS-Prefetch-Control`). The origin never sends it, so
 * seeing it can only mean the stamp was applied. Default → absent; switched off → `off`; switched back
 * on → absent again, with no restart in between.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('turning off pre-resolution stamps X-DNS-Prefetch-Control: off on normal tabs, live', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>PrefetchProbe</title><body>probe</body>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.dns-prefetch-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(`${base}/`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: /PrefetchProbe/ })).toHaveCount(1);

    /** The header as the PAGE sees it on a fresh same-origin response. */
    const headerSeenByPage = (): Promise<string | null> =>
      app.evaluate(async ({ webContents }) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('127.0.0.1'));
        if (wc === undefined) throw new Error('probe page not found');
        return (await wc.executeJavaScript(
          "fetch('/?probe=' + Date.now(), { cache: 'no-store' }).then((r) => r.headers.get('x-dns-prefetch-control'))",
        )) as string | null;
      });
    const setPreload = (on: boolean): Promise<unknown> =>
      page.evaluate(async (value: boolean) => {
        await (
          window as unknown as { tepegoz: { updatePreferences(p: object): Promise<unknown> } }
        ).tepegoz.updatePreferences({ preloadPages: value });
      }, on);

    expect(await headerSeenByPage()).toBeNull(); // default: pre-resolution allowed, nothing stamped

    await setPreload(false);
    expect(await headerSeenByPage()).toBe('off'); // live, no restart

    await setPreload(true);
    expect(await headerSeenByPage()).toBeNull(); // and back
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
