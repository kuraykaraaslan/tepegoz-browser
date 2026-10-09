import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * An ordinary web page cannot reach the browser's own `tepegoz://` pages (settings, downloads, history …) —
 * and with them the privileged bridge those pages are given — by any route a page controls: `fetch`, an
 * `<iframe>`, `window.open`. The renderer is untrusted, so this is a security boundary, and the code that
 * enforces it (a scheme guard on navigation, no bridge in browsed views) is exactly the kind a refactor can
 * quietly remove while every unit test keeps passing.
 *
 * The page is given a simulated click (`executeJavaScript(…, true)`) on purpose: without one, `window.open`
 * returns null because the POPUP BLOCKER refused it, and the assertion would hold for the wrong reason. With
 * activation, a null result can only mean the scheme itself was refused.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const PAGES = ['settings', 'downloads', 'history'] as const;

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('a web page cannot fetch, frame or open the browser’s internal pages, and has no bridge', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>HostPage</title><body>host</body>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.internal-pages-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: { createTab(u: string): void } }).tepegoz.createTab(u);
    }, base);
    await expect(page.getByRole('tab', { name: /HostPage/ })).toHaveCount(1, { timeout: 30_000 });
    const tabsBefore = await page.getByRole('tab').count();

    const result = await app.evaluate(async ({ webContents }, pages: readonly string[]) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('127.0.0.1'));
      if (wc === undefined) throw new Error('host page not found');
      const script = `(async () => {
        const res = {};
        for (const name of ${JSON.stringify(pages)}) {
          const u = 'tepegoz://' + name;
          try { const r = await fetch(u); res['fetch-' + name] = 'status ' + r.status; }
          catch (e) { res['fetch-' + name] = 'rejected'; }
          const f = document.createElement('iframe');
          f.src = u;
          document.body.appendChild(f);
          await new Promise((r) => setTimeout(r, 500));
          try { res['iframe-' + name] = f.contentWindow.location.href; }
          catch (e) { res['iframe-' + name] = 'cross-origin'; }
          try { res['open-' + name] = window.open(u) ? 'opened' : 'null'; }
          catch (e) { res['open-' + name] = 'threw'; }
        }
        res.bridge = typeof window.tepegoz;
        return res;
      })()`;
      return (await wc.executeJavaScript(script, true)) as Record<string, string>;
    }, PAGES);

    for (const name of PAGES) {
      expect(result[`fetch-${name}`], `fetch ${name}`).toBe('rejected');
      // A frame that never loaded the page still reads as the blank document it started as.
      expect(result[`iframe-${name}`], `iframe ${name}`).toMatch(/^(about:blank|cross-origin)$/);
      expect(result[`open-${name}`], `window.open ${name}`).not.toBe('opened');
    }
    // No privileged bridge exists in a browsed page.
    expect(result['bridge']).toBe('undefined');

    // And nothing opened: no new tab, and no web contents showing an internal page.
    await new Promise((r) => setTimeout(r, 800));
    expect(await page.getByRole('tab').count()).toBe(tabsBefore);
    const urls = await app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().map((w) => w.getURL()),
    );
    expect(urls.filter((u) => u.startsWith('tepegoz://'))).toEqual([]);
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
