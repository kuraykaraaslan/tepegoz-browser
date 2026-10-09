import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * "Block third-party cookies", measured at the wire. A page on `first.test` embeds an image from
 * `third.test` twice, one after the other; the third party's response sets a cookie, and the server
 * records whether the SECOND request carried it back.
 *
 *   setting off → the cookie round-trips (the control: a tracker really can follow the user here);
 *   setting on  → it does not, yet the same `third.test` visited directly as a first party still keeps
 *                 and sends its own cookie — the block is about who is asking, not about the site.
 *
 * Two hostnames are mapped to the one local server so they are genuinely different registrable domains.
 * It is served over HTTPS (a throwaway `openssl` certificate, `--ignore-certificate-errors`) because a
 * cookie only travels cross-site as `SameSite=None; Secure`; over plain HTTP Chromium withholds it
 * regardless of this setting, and the "setting off" control would prove nothing.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Outcome {
  /** Cookie header on the second embedded request to third.test. */
  embedded: string | undefined;
  /** Cookie header on a direct (first-party) visit to third.test after it set its own cookie. */
  firstParty: string | undefined;
}

async function run(prefs: Record<string, unknown>, tag: string): Promise<Outcome> {
  const seen = new Map<string, string | undefined>();
  let port = '';
  const certDir = mkdtempSync(join(tmpdir(), 'tepegoz-tpc-'));
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1'],
      ...['-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')],
      ...['-subj', '/CN=first.test', '-addext', 'subjectAltName=DNS:first.test,DNS:third.test'],
    ],
    { stdio: 'ignore' },
  );
  const tls = {
    key: readFileSync(join(certDir, 'key.pem')),
    cert: readFileSync(join(certDir, 'cert.pem')),
  };
  const server: Server = createServer(tls, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = req.url ?? '';
    if (host === 'first.test') {
      res.writeHead(200, { 'content-type': 'text/html' });
      // The second image is requested only once the first has loaded, so its request happens after the
      // first response's Set-Cookie has been processed (or discarded).
      res.end(
        `<!doctype html><title>FirstPage</title><img src="https://third.test:${port}/pixel?n=1" ` +
          `onload="var i=new Image();i.onload=function(){document.title='FirstDone'};` +
          `i.src='https://third.test:${port}/pixel?n=2'">`,
      );
      return;
    }
    // third.test
    if (url.startsWith('/pixel')) {
      seen.set(url, req.headers.cookie);
      res.writeHead(200, {
        'content-type': 'image/gif',
        'set-cookie': 'tracker=abc; Path=/; Max-Age=3600; SameSite=None; Secure',
      });
      res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
      return;
    }
    if (url === '/own') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': 'own=xyz; Path=/; Max-Age=3600; SameSite=None; Secure',
      });
      res.end('<!doctype html><title>OwnSet</title>own');
      return;
    }
    if (url.startsWith('/echo')) {
      seen.set(url, req.headers.cookie);
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>OwnEcho</title>echo');
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = String((server.address() as AddressInfo).port);

  const profileDir = join(process.cwd(), `.third-party-cookies-${tag}`);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ httpsFirstEverywhere: false, ...prefs }),
  );
  const app = await electron.launch({
    args: [
      `--user-data-dir=${profileDir}`,
      '--host-resolver-rules=MAP first.test 127.0.0.1, MAP third.test 127.0.0.1',
      '--ignore-certificate-errors',
      appDir,
    ],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();

    await box.fill(`https://first.test:${port}/`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: 'FirstDone' })).toHaveCount(1, { timeout: 30_000 });

    // The same site as a FIRST party: it sets its own cookie and gets it back.
    await box.fill(`https://third.test:${port}/own`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: 'OwnSet', selected: true })).toHaveCount(1, {
      timeout: 30_000,
    });
    await box.fill(`https://third.test:${port}/echo`);
    await box.press('Enter');
    await expect.poll(() => seen.has('/echo'), { timeout: 30_000 }).toBe(true);

    return { embedded: seen.get('/pixel?n=2'), firstParty: seen.get('/echo') };
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    for (const dir of [profileDir, certDir]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the next run clears it */
      }
    }
  }
}

test('a third party can follow the user by default; with the setting on it cannot, a first party still can', async () => {
  test.setTimeout(240_000);

  const open = await run({}, 'open');
  expect(open.embedded).toContain('tracker=abc'); // the control: the cookie round-trips
  expect(open.firstParty).toContain('own=xyz');

  const blocked = await run({ blockThirdPartyCookies: true }, 'blocked');
  expect(blocked.embedded).toBeUndefined();
  expect(blocked.firstParty).toContain('own=xyz');
  // And the tracker's cookie was never stored, so even the first-party visit does not carry it.
  expect(blocked.firstParty).not.toContain('tracker=abc');
});
