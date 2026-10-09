import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { startSocks5, type TestSocksServer } from './socks5-test-server';

/**
 * HTTPS-only on a tunnel-bound tab (ADR-0050), end to end in the SHIPPING app — the live check the
 * phase file listed as owed.
 *
 * The set-up is the one `spike-tunnel-binding` uses: a local SOCKS5 server stands in for the tunnel, and
 * everything it is asked to CONNECT to is forwarded to ONE plain-HTTP origin. That makes the origin a
 * detector with two readable outcomes:
 *  - a request line reaching it means cleartext HTTP left the browser through the tunnel;
 *  - a TLS ClientHello reaching it is not an HTTP request, so it logs no hit — it is the proof that the
 *    browser tried HTTPS (the upgrade), and the handshake failing is what the interstitial reacts to.
 *
 * Phase 1 turns the setting on (the default) and expects: nothing cleartext arrives, and the tab shows
 * the "does not support a secure connection" page instead of a Chromium error. Phase 2 turns it off and
 * expects the same URL to reach the origin in cleartext — which is also what shows the detector works.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const PROBE_HOST = 'tunnel-probe.test';
const INTERSTITIAL =
  /This site does not support a secure connection|Bu site güvenli bağlantıyı desteklemiyor/;

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  createTab(url?: string): void;
  addNetworkConnection(input: {
    kind: 'byo-socks';
    label: string;
    note: string;
    socksPort: number;
  }): Promise<void>;
  setGeneralNetworkBinding(
    binding: { kind: 'direct' } | { kind: 'connection'; connectionId: string },
  ): Promise<void>;
  getNetworkState(): Promise<{ connections: { id: string }[] }>;
  updatePreferences(patch: Record<string, unknown>): Promise<unknown>;
}

test('a tunnel-bound tab never sends cleartext http: it tries https and explains the failure', async () => {
  test.setTimeout(240_000);

  const hits: string[] = [];
  const origin: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>CLEARTEXT-REACHED-ORIGIN</title><body>cleartext</body>');
  });
  // A TLS ClientHello is not an HTTP request; swallow the parse error rather than let it surface.
  origin.on('clientError', (_err, socket) => socket.destroy());
  await new Promise<void>((r) => origin.listen(0, '127.0.0.1', () => r()));
  const originPort = (origin.address() as AddressInfo).port;
  const socks: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: originPort });

  const profileDir = join(process.cwd(), `.https-only-profile-${socks.port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [
      `--user-data-dir=${profileDir}`,
      `--host-resolver-rules=MAP ${PROBE_HOST} 127.0.0.1`,
      appDir,
    ],
    env: guiEnv(),
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();

    await page.evaluate(async (port: number) => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      await t.addNetworkConnection({
        kind: 'byo-socks',
        label: 'Spike',
        note: 'e2e',
        socksPort: port,
      });
      const state = await t.getNetworkState();
      const id = state.connections[0]?.id;
      if (id === undefined) throw new Error('connection was not added');
      await t.setGeneralNetworkBinding({ kind: 'connection', connectionId: id });
    }, socks.port);

    // ── Phase 1: HTTPS-only on (the default) ──
    const url = `http://${PROBE_HOST}:${originPort}/secret-page`;
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, url);

    // The upgrade really went through the tunnel: the proxy was asked to CONNECT to the probe host.
    await expect
      .poll(() => socks.requests.some((r) => r.host === PROBE_HOST), { timeout: 60_000 })
      .toBe(true);
    // The handshake cannot succeed against a plain-HTTP origin, so the tab explains itself.
    await expect(page.getByRole('tab', { name: INTERSTITIAL })).toHaveCount(1, { timeout: 60_000 });
    // And not one cleartext request line reached the far side of the tunnel.
    expect(hits).toEqual([]);

    // ── Phase 2: switch it off — the very same URL now reaches the origin in cleartext ──
    await page.evaluate(async () => {
      await (window as unknown as { tepegoz: Bridge }).tepegoz.updatePreferences({
        httpsOnlyOnTunnel: false,
      });
    });
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, url);
    await expect
      .poll(() => hits.some((h) => h.startsWith('/secret-page')), { timeout: 60_000 })
      .toBe(true);
    await expect(page.getByRole('tab', { name: /CLEARTEXT-REACHED-ORIGIN/ })).toHaveCount(1, {
      timeout: 60_000,
    });
  } finally {
    await app.close().catch(() => undefined);
    await socks.close().catch(() => undefined);
    await new Promise<void>((r) => origin.close(() => r()));
    rmSync(profileDir, { recursive: true, force: true });
  }
});
