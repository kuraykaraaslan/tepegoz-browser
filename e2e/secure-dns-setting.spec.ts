import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Secure DNS (DNS over HTTPS), against the real Electron.
 *
 * Whether a particular DoH server answers is the network's business and not checkable offline. What IS
 * checkable, and what unit tests with a mocked `app` cannot show, is that the shape the app hands to
 * `app.configureHostResolver` is one the real Electron accepts, and that the settings flow — launch with
 * the mode on, change it live through the preference bridge — neither throws nor stops pages loading.
 * Loopback pages are used so no name lookup is involved in the page loads themselves.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('Electron accepts the resolver configuration, and the mode can be changed live', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>DnsProbePage</title><body>ok</body>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.secure-dns-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // Launch with it ON, against a server that cannot answer: startup must still succeed.
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({
      secureDnsMode: 'secure',
      secureDnsProvider: 'custom',
      secureDnsCustomUrl: 'https://127.0.0.1:9/dns-query',
    }),
  );

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();

    // The exact call shape the app makes, on the real Electron: a bad shape throws a TypeError here.
    const accepted = await app.evaluate(({ app: a }) => {
      for (const cfg of [
        { secureDnsMode: 'off' as const, secureDnsServers: [] as string[] },
        {
          secureDnsMode: 'automatic' as const,
          secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
        },
        { secureDnsMode: 'secure' as const, secureDnsServers: ['https://dns.google/dns-query'] },
      ]) {
        a.configureHostResolver(cfg);
      }
      return true;
    });
    expect(accepted).toBe(true);

    // The preference bridge: switch the mode live, through every state, then back to off.
    for (const patch of [
      { secureDnsMode: 'automatic', secureDnsProvider: 'quad9' },
      { secureDnsMode: 'secure', secureDnsProvider: 'google' },
      { secureDnsMode: 'off' },
    ]) {
      const prefs = await page.evaluate(async (p: object) => {
        const t = (
          window as unknown as {
            tepegoz: { updatePreferences(p: object): Promise<{ secureDnsMode: string }> };
          }
        ).tepegoz;
        return t.updatePreferences(p);
      }, patch);
      expect(prefs.secureDnsMode).toBe(patch.secureDnsMode);
    }

    // And a page still loads afterwards.
    await box.fill(`${base}/`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: /DnsProbePage/ })).toHaveCount(1, {
      timeout: 30_000,
    });
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
