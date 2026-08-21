import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { startSocks5, type TestSocksServer } from './socks5-test-server';

/**
 * SPIKE: the whole Phase 5 chain, end to end in the SHIPPING app — add a connection, set the default
 * route, open a tab, and measure where its traffic actually goes.
 *
 * Everything below this test is unit-tested in isolation (resolution, pool health, fail-closed proxy
 * config, re-hosting). What only a live run can show is that they compose: that a route set through the
 * real bridge produces a page load through the real SOCKS endpoint, and that the browser's own
 * kill-switch notices when that endpoint dies.
 *
 * The detector is sighted, as in `spike-tunnel-failclosed`: Chromium's resolver is pointed at a
 * reachable clear-path origin, so if the tab were NOT tunneled the request would land there and be
 * recorded. "No clear-path hit" therefore means something.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const PROBE_HOST = 'tunnel-probe.test';

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Origin {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

async function startOrigin(name: string): Promise<Origin> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html><body>${name}</body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return {
    port: (server.address() as AddressInfo).port,
    hits,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
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
  getNetworkState(): Promise<{
    connections: { id: string; label: string; status: string }[];
    general: { kind: string; connectionId?: string };
    tabs: Record<string, { connectionId: string | null; source: string; egressAllowed: boolean }>;
  }>;
}

test('a connection added through the bridge actually routes a tab, and its drop is noticed', async () => {
  test.setTimeout(180_000);

  const tunnelOrigin = await startOrigin('VIA-TUNNEL');
  const directOrigin = await startOrigin('CLEAR-PATH');
  const socks: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: tunnelOrigin.port });

  const profileDir = join(process.cwd(), `.spike-profile-binding-${socks.port}`);
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

    // ── 1. Add the connection and make it the profile-wide default, through the real bridge ──
    await page.evaluate(async (port: number) => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      await t.addNetworkConnection({
        kind: 'byo-socks',
        label: 'Spike',
        note: 'e2e',
        socksPort: port,
      });
    }, socks.port);

    const connectionId = await page.evaluate(async () => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      const state = await t.getNetworkState();
      return state.connections[0]?.id ?? null;
    });
    expect(connectionId).not.toBeNull();

    await page.evaluate(async (id: string) => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      await t.setGeneralNetworkBinding({ kind: 'connection', connectionId: id });
    }, connectionId as string);

    // ── 2. A NEW tab must be born on that route, not on Direct ──
    const clearUrl = `http://${PROBE_HOST}:${directOrigin.port}/routed`;
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, clearUrl);

    // The page is only reachable through the proxy's forward target, so a hit there is proof of routing.
    await expect
      .poll(() => tunnelOrigin.hits.filter((h) => h.startsWith('/routed')).length, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    // And nothing went out the clear path, which the resolver rule made genuinely reachable.
    expect(directOrigin.hits).toEqual([]);

    // ── 3. The browser agrees about where that tab is ──
    const routed = await page.evaluate(async () => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      const state = await t.getNetworkState();
      return Object.values(state.tabs).filter((r) => r.connectionId !== null);
    });
    expect(routed.length).toBeGreaterThan(0);
    expect(routed[0]?.source).toBe('general');
    expect(routed[0]?.egressAllowed).toBe(true);

    // ── 4. Kill the endpoint. The pool's health poll must notice, and the tab must be marked blocked ──
    await socks.close();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
            const state = await t.getNetworkState();
            return state.connections[0]?.status ?? 'unknown';
          }),
        { timeout: 60_000, intervals: [1000] },
      )
      .toBe('down');

    const afterDrop = await page.evaluate(async () => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      const state = await t.getNetworkState();
      return Object.values(state.tabs).filter((r) => r.connectionId !== null);
    });
    expect(afterDrop.length).toBeGreaterThan(0);
    // Fail-closed, and SAID so: the tab is still bound to the connection, and its egress is not allowed.
    expect(afterDrop.every((r) => !r.egressAllowed)).toBe(true);
    // Nothing escaped to the clear path while all that happened.
    expect(directOrigin.hits).toEqual([]);
  } finally {
    await app.close();
    await socks.close();
    await directOrigin.close();
    await tunnelOrigin.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
