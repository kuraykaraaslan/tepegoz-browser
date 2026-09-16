import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { startSocks5, type TestSocksServer } from './socks5-test-server';

/**
 * SPIKE: the "A-vs-B" case Phase 5's DoD names as owed on top of `spike-tunnel-binding` — TWO live
 * connections at once, each bound to a DIFFERENT tab, proving they stay isolated rather than just that
 * one connection routes correctly alone.
 *
 * Realistic flow, not a synthetic one: a tab is opened on an ordinary (Direct-reachable) page FIRST,
 * THEN routed through a connection — matching the actual "Route this tab through…" menu, which only
 * ever acts on a tab that already has a page loaded. `TabManager.rehostTab` reloads the tab's own
 * recorded URL on the new session; a tab whose navigation never committed has no recorded URL to carry
 * over, so binding a still-loading tab is not a scenario the product supports and not what this proves.
 *
 * SIGHTED like `spike-tunnel-binding`: each tab's initial URL points at `clearOrigin`, a plain
 * Direct-reachable server distinct from either mock SOCKS server's FIXED forward target (`originA` /
 * `originB`). After binding, the tab reloads the SAME url on the tunneled session — if that reload
 * silently fell back to Direct, it would hit `clearOrigin` AGAIN (a real, reachable server); a hit
 * arriving at `originA`/`originB` instead is only possible if the reload actually went out through
 * socks A/B, since those mock servers ignore the requested host entirely and always forward to their
 * own fixed target. `clearOrigin`'s hit count therefore has an exact expected value (one per tab's
 * initial load, never a rebind reload) as the leak detector.
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
  bindTabNetwork(
    tabId: string,
    binding: { kind: 'direct' } | { kind: 'connection'; connectionId: string },
  ): Promise<void>;
  getNetworkState(): Promise<{
    connections: { id: string; label: string; status: string }[];
    tabs: Record<string, { connectionId: string | null; source: string; egressAllowed: boolean }>;
  }>;
  getTabsState(): Promise<{ tabs: { id: string; url: string; isLoading: boolean }[] }>;
}

/** Poll until a tab id absent from `before` shows up AND has finished its initial load — avoiding any
 *  race on `createTab` (fire-and-forget) and giving `TabManager` a committed `record.url` to carry over
 *  once the tab is later bound to a connection. */
async function waitForLoadedNewTab(
  page: { evaluate: <T>(fn: () => Promise<T>) => Promise<T> },
  before: ReadonlySet<string>,
): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const tabs = await page.evaluate(async () => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      const state = await t.getTabsState();
      return state.tabs;
    });
    const created = tabs.find((tab) => !before.has(tab.id));
    if (created !== undefined && !created.isLoading && created.url.length > 0) return created.id;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('new tab never finished its initial load');
}

/** Bind `tabId` to `connectionId` and wait until the browser agrees egress is allowed on it. */
async function bindAndWaitAllowed(
  page: { evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg: A) => Promise<T> },
  tabId: string,
  connectionId: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, connectionId: cid }: { id: string; connectionId: string }) => {
      const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
      await t.bindTabNetwork(id, { kind: 'connection', connectionId: cid });
    },
    { id: tabId, connectionId },
  );
  await expect
    .poll(
      async () =>
        page.evaluate(async (id: string) => {
          const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
          const state = await t.getNetworkState();
          return state.tabs[id]?.egressAllowed ?? false;
        }, tabId),
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
}

test('two connections bound to two different tabs never cross — each tab reaches only its own endpoint', async () => {
  test.setTimeout(180_000);

  const clearOrigin = await startOrigin('CLEAR');
  const originA = await startOrigin('ORIGIN-A');
  const originB = await startOrigin('ORIGIN-B');
  const socksA: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: originA.port });
  const socksB: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: originB.port });

  const profileDir = join(process.cwd(), `.spike-profile-cross-tab-${socksA.port}`);
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

    // ── 1. Add BOTH connections through the real bridge ──
    const [connAId, connBId] = await page.evaluate(
      async ({ portA, portB }: { portA: number; portB: number }) => {
        const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
        await t.addNetworkConnection({
          kind: 'byo-socks',
          label: 'Spike-A',
          note: 'e2e',
          socksPort: portA,
        });
        await t.addNetworkConnection({
          kind: 'byo-socks',
          label: 'Spike-B',
          note: 'e2e',
          socksPort: portB,
        });
        const state = await t.getNetworkState();
        const a = state.connections.find((c) => c.label === 'Spike-A')?.id ?? null;
        const b = state.connections.find((c) => c.label === 'Spike-B')?.id ?? null;
        return [a, b];
      },
      { portA: socksA.port, portB: socksB.port },
    );
    expect(connAId).not.toBeNull();
    expect(connBId).not.toBeNull();

    // ── 2. Tab 1: open it on an ordinary Direct-reachable page and let it actually finish loading, THEN
    // bind it to connection A — the real "Route this tab through…" flow, never a still-loading tab.
    const tabsBeforeA = new Set(
      (
        await page.evaluate(async () => {
          const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
          return (await t.getTabsState()).tabs;
        })
      ).map((tab) => tab.id),
    );
    const urlA = `http://${PROBE_HOST}:${String(clearOrigin.port)}/initial-a`;
    await page.evaluate((url: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(url);
    }, urlA);
    const tab1Id = await waitForLoadedNewTab(page, tabsBeforeA);
    expect(clearOrigin.hits.filter((h) => h.startsWith('/initial-a'))).toHaveLength(1);

    await bindAndWaitAllowed(page, tab1Id, connAId as string);

    // The rebind reload replays the SAME url. If that reload actually went through the tunnel, socks A
    // forwards it to origin A (never to clearOrigin, whatever the URL said) — a real leak would show up
    // as a SECOND clearOrigin hit instead.
    await expect.poll(() => originA.hits.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(clearOrigin.hits.filter((h) => h.startsWith('/initial-a'))).toHaveLength(1);

    // ── 3. Tab 2: same discipline, bound to connection B — proving the two bindings stay independent
    // rather than just that binding works once.
    const tabsBeforeB = new Set(
      (
        await page.evaluate(async () => {
          const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
          return (await t.getTabsState()).tabs;
        })
      ).map((tab) => tab.id),
    );
    const urlB = `http://${PROBE_HOST}:${String(clearOrigin.port)}/initial-b`;
    await page.evaluate((url: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(url);
    }, urlB);
    const tab2Id = await waitForLoadedNewTab(page, tabsBeforeB);
    expect(clearOrigin.hits.filter((h) => h.startsWith('/initial-b'))).toHaveLength(1);

    await bindAndWaitAllowed(page, tab2Id, connBId as string);

    await expect.poll(() => originB.hits.length, { timeout: 30_000 }).toBeGreaterThan(0);

    // ── 4. The isolation property itself ──
    // Neither rebind reload fell back to Direct: clearOrigin never saw '/initial-a' or '/initial-b'
    // again after the tab's ONE initial load (a stray '/favicon.ico' fetch is a normal, harmless part of
    // that same initial load and is not what this line is checking for).
    expect(clearOrigin.hits.filter((h) => h.startsWith('/initial-a'))).toHaveLength(1);
    expect(clearOrigin.hits.filter((h) => h.startsWith('/initial-b'))).toHaveLength(1);
    // Each mock SOCKS endpoint was asked for a CONNECT exactly once — one tab, one proxy, no fan-out of
    // one tab's traffic across both endpoints, and no cross-talk between them.
    expect(socksA.requests.length).toBe(1);
    expect(socksB.requests.length).toBe(1);
    // Tab 1's binding is still exactly what it was — binding tab 2 to B never touched tab 1's route.
    const finalRoutes = await page.evaluate(
      async ({ id1, id2 }: { id1: string; id2: string }) => {
        const t = (window as unknown as { tepegoz: Bridge }).tepegoz;
        const state = await t.getNetworkState();
        return { tab1: state.tabs[id1], tab2: state.tabs[id2] };
      },
      { id1: tab1Id, id2: tab2Id },
    );
    expect(finalRoutes.tab1?.connectionId).toBe(connAId);
    expect(finalRoutes.tab2?.connectionId).toBe(connBId);
  } finally {
    await app.close();
    await socksA.close();
    await socksB.close();
    await originA.close();
    await originB.close();
    await clearOrigin.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
