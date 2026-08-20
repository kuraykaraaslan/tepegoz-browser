import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * SPIKE: the tab strip never receives a REMOTE favicon URL.
 *
 * The leak this closes: the strip renders in the trusted app chrome, on `persist:tepegoz-app`, which has
 * no proxy and never will. An `<img src="https://site/favicon.ico">` there is the BROWSER CHROME making a
 * clear-path request to the server of the page you are looking at — including one opened behind a VPN or
 * Tor. It fires on every navigation and nothing about it is visible.
 *
 * Main now fetches the icon on the PAGE'S own session and inlines it, so what reaches the chrome is
 * bytes, not a URL. This measures that end to end in the shipping app: the origin server records who
 * asked for what, and the tab state is asserted to carry `data:` and never the origin's URL.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  getTabsState(): Promise<{ tabs: { id: string; url: string; faviconUrl: string | null }[] }>;
  createTab(url?: string): void;
}

test('a page favicon reaches the tab strip as inlined bytes, never as a remote URL', async () => {
  test.setTimeout(120_000);

  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if ((req.url ?? '').startsWith('/icon.png')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(PNG);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><head><link rel="icon" href="/icon.png"><title>Favicon spike</title></head><body>hi</body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const pageUrl = `http://127.0.0.1:${port}/`;

  const profileDir = join(process.cwd(), `.spike-profile-favicon-${port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();
    await page.evaluate(
      (u: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u),
      pageUrl,
    );

    const readFavicon = async (): Promise<string | null> =>
      page.evaluate(async (needle: string) => {
        const api = (window as unknown as { tepegoz: Bridge }).tepegoz;
        const st = await api.getTabsState();
        return st.tabs.find((t) => t.url.includes(needle))?.faviconUrl ?? null;
      }, `:${port}`);

    // The icon is fetched asynchronously in main, so the strip shows the globe fallback until it lands.
    await expect.poll(readFavicon, { timeout: 20_000 }).not.toBeNull();
    const favicon = (await readFavicon()) ?? '';

    // Inlined bytes, not a URL the chrome would have to fetch itself.
    expect(favicon).toMatch(/^data:image\/png;base64,/);
    // If the chrome were still being handed the URL, this is exactly what it would contain.
    expect(favicon).not.toContain('http');

    // And the icon WAS actually fetched — by main, on the page's session, not skipped.
    expect(hits.filter((h) => h.startsWith('/icon.png'))).not.toHaveLength(0);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
