import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * "Clear browsing data" really clears, measured at the wire (Phase 2c). The unit suite pins the category
 * split and the counts; this checks the claim a user relies on — after clearing cookies, the NEXT request
 * to the site carries none, and after clearing history the history list is empty.
 *
 * Each "after" is paired with a "before" on the same path: a cookie the server never saw in the first
 * place would make the post-clear assertion pass for any reason at all.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  getHistory(params?: { limit?: number }): Promise<{ url: string }[]>;
  clearBrowsingData(request: { range: string; categories: string[] }): Promise<{
    cookiePartitions: number;
    failed: string[];
  }>;
}

test('clearing cookies stops them being sent, and clearing history empties the list', async () => {
  test.setTimeout(150_000);

  const cookieSeen = new Map<string, string | undefined>();
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/set')) {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': 'session=abc123; Path=/; Max-Age=3600',
      });
      res.end('<!doctype html><title>CookieSet</title>set');
      return;
    }
    if (url.startsWith('/echo')) {
      cookieSeen.set(url, req.headers.cookie);
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end(`<!doctype html><title>Echo${url.slice(-1)}</title>echo`);
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.clear-data-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    const open = async (path: string, title: RegExp): Promise<void> => {
      await box.fill(`${base}${path}`);
      await box.press('Enter');
      await expect(page.getByRole('tab', { name: title })).toHaveCount(1, { timeout: 30_000 });
    };
    const bridge = <T>(fn: (b: Bridge) => Promise<T>): Promise<T> =>
      page.evaluate(`(${fn.toString()})(window.tepegoz)`) as Promise<T>;

    await open('/set', /CookieSet/);
    await open('/echo?n=1', /Echo1/);
    // Before: the cookie travels, and the visits are in history.
    expect(cookieSeen.get('/echo?n=1')).toContain('session=abc123');
    await expect
      .poll(async () => (await bridge((b) => b.getHistory({ limit: 50 }))).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    const result = await bridge((b) =>
      b.clearBrowsingData({ range: 'all-time', categories: ['cookies', 'cache', 'history'] }),
    );
    expect(result.failed).toEqual([]);
    expect(result.cookiePartitions).toBeGreaterThan(0);

    // After: the next request to the same site carries no cookie, and history is empty.
    await open('/echo?n=2', /Echo2/);
    expect(cookieSeen.get('/echo?n=2')).toBeUndefined();
    const history = await bridge((b) => b.getHistory({ limit: 50 }));
    expect(history.some((h) => h.url.includes('/set') || h.url.includes('/echo?n=1'))).toBe(false);
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
