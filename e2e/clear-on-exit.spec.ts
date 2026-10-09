import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * "Clear cookies and site data when the browser closes" (`clearOnExit`), measured the way a user would
 * notice: log in, quit, reopen, and see whether the site still knows you.
 *
 * The two profiles differ ONLY in the preference. The control (no `clearOnExit`) must keep its cookie
 * across the same quit, otherwise "the cookie is gone" could just mean cookies never survive a restart
 * in this harness and the setting would be getting credit for nothing.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** Visit /set (a persistent cookie), quit; relaunch, visit /echo, and report the cookie header it saw. */
async function cookieAfterRestart(
  prefs: Record<string, unknown>,
  tag: string,
): Promise<string | undefined> {
  // Keyed by URL: the relaunch also restores the previous tab, which requests /echo again on its own.
  const seen = new Map<string, string | undefined>();
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/set') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': 'session=abc123; Path=/; Max-Age=3600',
      });
      res.end('<!doctype html><title>CookieSet</title>set');
      return;
    }
    if (url.startsWith('/echo')) {
      seen.set(url, req.headers.cookie);
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>CookieEcho</title>echo');
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), `.clear-on-exit-${tag}`);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify(prefs));
  const launch = () =>
    electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });

  try {
    let app = await launch();
    let page = await app.firstWindow();
    let box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(`${base}/set`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: /CookieSet/ })).toHaveCount(1, { timeout: 30_000 });
    // Same launch: the cookie IS sent (so the later absence is a change, not a never-was).
    await box.fill(`${base}/echo?before`);
    await box.press('Enter');
    await expect.poll(() => seen.has('/echo?before'), { timeout: 30_000 }).toBe(true);
    expect(seen.get('/echo?before')).toContain('session=abc123');
    await app.close(); // a clean quit — the clear runs here

    app = await launch();
    page = await app.firstWindow();
    box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(`${base}/echo?after`);
    await box.press('Enter');
    await expect.poll(() => seen.has('/echo?after'), { timeout: 30_000 }).toBe(true);
    await app.close();
    return seen.get('/echo?after');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
}

test('cookies survive a restart by default and are gone after it with "clear on exit"', async () => {
  test.setTimeout(240_000);
  // Control first: without the setting the cookie is still there after the same quit and relaunch.
  expect(await cookieAfterRestart({}, 'control')).toContain('session=abc123');
  // With the setting, the same sequence leaves the site with no cookie.
  expect(await cookieAfterRestart({ clearOnExit: ['cookies'] }, 'clear')).toBeUndefined();
});

test('sites on the keep list keep their cookies through the exit clear; every other site loses them', async () => {
  test.setTimeout(240_000);

  const seen = new Map<string, string | undefined>();
  const server: Server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = req.url ?? '';
    if (url === '/set') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': `session=for-${host}; Path=/; Max-Age=3600`,
      });
      res.end(`<!doctype html><title>Set ${host}</title>set`);
      return;
    }
    if (url.startsWith('/echo')) {
      seen.set(`${host}${url}`, req.headers.cookie);
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end(`<!doctype html><title>Echo ${host}</title>echo`);
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = String((server.address() as AddressInfo).port);

  const profileDir = join(process.cwd(), '.clear-on-exit-keep');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({
      httpsFirstEverywhere: false,
      clearOnExit: ['cookies'],
      clearOnExitKeepSites: ['kept.test'],
    }),
  );
  // Two real hostnames, both served by the one local server: cookies are per host, so they are two sites.
  const launch = () =>
    electron.launch({
      args: [
        `--user-data-dir=${profileDir}`,
        '--host-resolver-rules=MAP kept.test 127.0.0.1, MAP dropped.test 127.0.0.1',
        appDir,
      ],
      env: guiEnv(),
    });

  try {
    let app = await launch();
    let page = await app.firstWindow();
    let box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    for (const host of ['kept.test', 'dropped.test']) {
      await box.fill(`http://${host}:${port}/set`);
      await box.press('Enter');
      await expect(page.getByRole('tab', { name: `Set ${host}`, selected: true })).toHaveCount(1, {
        timeout: 30_000,
      });
      // Control inside the same launch: each site's own cookie is sent back to it.
      await box.fill(`http://${host}:${port}/echo?before`);
      await box.press('Enter');
      await expect.poll(() => seen.has(`${host}/echo?before`), { timeout: 30_000 }).toBe(true);
      expect(seen.get(`${host}/echo?before`)).toContain(`session=for-${host}`);
    }
    await app.close(); // clean quit: the clear runs here

    app = await launch();
    page = await app.firstWindow();
    box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    for (const host of ['kept.test', 'dropped.test']) {
      await box.fill(`http://${host}:${port}/echo?after`);
      await box.press('Enter');
      await expect.poll(() => seen.has(`${host}/echo?after`), { timeout: 30_000 }).toBe(true);
    }
    await app.close();

    expect(seen.get('kept.test/echo?after')).toContain('session=for-kept.test');
    expect(seen.get('dropped.test/echo?after')).toBeUndefined();
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
