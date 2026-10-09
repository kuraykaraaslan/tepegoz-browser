import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * HTTPS-first on an ORDINARY tab ("Use secure connections for all sites"), end to end.
 *
 * Same detector idea as `https-only-tunnel.spec.ts`: one plain-HTTP origin. A request line reaching it is
 * cleartext HTTP; a TLS ClientHello is not an HTTP request, so it logs nothing — which makes "the origin saw
 * no hit" the proof that the browser tried HTTPS first, and the failed handshake is what the warning page
 * reacts to. The probe host is mapped to 127.0.0.1 by a resolver rule so it is NOT a loopback literal (which
 * the mode deliberately exempts, like the rest of the local network).
 *
 * Flow: off by default → cleartext goes straight through; on → no cleartext, a warning page; click
 * "Continue over HTTP" → that one site loads over http.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const PROBE_HOST = 'https-first.test';
const WARNING =
  /This site does not support a secure connection|Bu site güvenli bağlantıyı desteklemiyor/;

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function withOrigin(
  run: (origin: { port: number; hits: string[] }) => Promise<void>,
): Promise<void> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>PLAIN-HTTP-PAGE</title><body>plain</body>');
  });
  server.on('clientError', (_err, socket) => socket.destroy()); // a TLS ClientHello is not HTTP
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    await run({ port: (server.address() as AddressInfo).port, hits });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function launch(prefs: Record<string, unknown>): Promise<{
  app: ElectronApplication;
  cleanup: () => void;
}> {
  const profileDir = join(process.cwd(), '.https-first-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify(prefs));
  const app = await electron.launch({
    args: [
      `--user-data-dir=${profileDir}`,
      `--host-resolver-rules=MAP ${PROBE_HOST} 127.0.0.1`,
      appDir,
    ],
    env: guiEnv(),
  });
  return {
    app,
    cleanup: () => {
      try {
        rmSync(profileDir, { recursive: true, force: true });
      } catch {
        /* the next run clears it */
      }
    },
  };
}

test('off by default: a plain http page loads as it always did', async () => {
  test.setTimeout(150_000);
  await withOrigin(async ({ port, hits }) => {
    const { app, cleanup } = await launch({});
    try {
      const page = await app.firstWindow();
      const box = page.getByRole('combobox').first();
      await expect(box).toBeVisible();
      await box.fill(`http://${PROBE_HOST}:${port}/plain`);
      await box.press('Enter');
      await expect(page.getByRole('tab', { name: /PLAIN-HTTP-PAGE/ })).toHaveCount(1, {
        timeout: 30_000,
      });
      expect(hits).toContain('/plain');
    } finally {
      await app.close().catch(() => undefined);
      cleanup();
    }
  });
});

test('on: no cleartext leaves, a warning page explains, and "continue" loads that site over http', async () => {
  test.setTimeout(240_000);
  await withOrigin(async ({ port, hits }) => {
    const { app, cleanup } = await launch({ httpsFirstEverywhere: true });
    try {
      const page = await app.firstWindow();
      const box = page.getByRole('combobox').first();
      await expect(box).toBeVisible();
      await box.fill(`http://${PROBE_HOST}:${port}/secure-first`);
      await box.press('Enter');

      // The warning page, not Chromium's error page — and not one cleartext request line at the origin.
      await expect(page.getByRole('tab', { name: WARNING })).toHaveCount(1, { timeout: 60_000 });
      expect(hits).toEqual([]);

      // Click "Continue over HTTP" inside the warning page (a data: page in the tab's own contents).
      await app.evaluate(async ({ webContents }) => {
        const wc = webContents
          .getAllWebContents()
          .find((w) => !w.isDestroyed() && w.getURL().startsWith('data:text/html'));
        if (wc === undefined) throw new Error('warning page not found');
        await wc.executeJavaScript("document.querySelector('a.go').click()", true);
      });

      // That one site now loads over plain http: the origin is reached, and the tab shows its page.
      await expect(page.getByRole('tab', { name: /PLAIN-HTTP-PAGE/ })).toHaveCount(1, {
        timeout: 60_000,
      });
      expect(hits.some((h) => h.startsWith('/secure-first'))).toBe(true);
    } finally {
      await app.close().catch(() => undefined);
      cleanup();
    }
  });
});
