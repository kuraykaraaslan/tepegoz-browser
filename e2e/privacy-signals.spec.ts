import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * Global Privacy Control and Do Not Track, measured at the wire. The page and a sub-resource it loads are
 * both requested, and the server records the headers of each — so the signal is shown to reach what a
 * page loads, not just the navigation.
 *
 *   defaults  → `Sec-GPC: 1` on every request, no `DNT`;
 *   opted out → no `Sec-GPC`, and `DNT: 1` once the user asks for it.
 *
 * The two launches differ only in preferences, which is what makes the second a control for the first.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function headersSeen(
  prefs: Record<string, unknown>,
): Promise<Map<string, IncomingHttpHeaders>> {
  const seen = new Map<string, IncomingHttpHeaders>();
  const server: Server = createServer((req, res) => {
    const path = req.url ?? '';
    if (path === '/page' || path === '/pixel') seen.set(path, req.headers);
    if (path === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>SignalPage</title><img src="/pixel">');
      return;
    }
    if (path === '/pixel') {
      res.writeHead(200, { 'content-type': 'image/gif' });
      res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'));
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/page`;

  const profileDir = join(process.cwd(), '.privacy-signals-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // These measure headers over plain HTTP; HTTPS-first would upgrade the probe and the server would never see it.
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ httpsFirstEverywhere: false, httpsOnlyOnTunnel: false, ...prefs }),
  );
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(url);
    await box.press('Enter');
    await expect.poll(() => seen.has('/pixel'), { timeout: 30_000 }).toBe(true);
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
  return seen;
}

test('Global Privacy Control is sent by default and Do Not Track is not; both follow the settings', async () => {
  test.setTimeout(180_000);

  const defaults = await headersSeen({});
  for (const path of ['/page', '/pixel']) {
    expect(defaults.get(path)?.['sec-gpc'], `${path} Sec-GPC`).toBe('1');
    expect(defaults.get(path)?.['dnt'], `${path} DNT`).toBeUndefined();
  }

  const optedOut = await headersSeen({ globalPrivacyControl: false, doNotTrack: true });
  for (const path of ['/page', '/pixel']) {
    expect(optedOut.get(path)?.['sec-gpc'], `${path} Sec-GPC`).toBeUndefined();
    expect(optedOut.get(path)?.['dnt'], `${path} DNT`).toBe('1');
  }
});
