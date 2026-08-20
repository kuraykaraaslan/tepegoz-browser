import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
// Imported by relative path, not by package name: the e2e runner has no workspace links, and the point
// of importing them AT ALL is that the spike must exercise the SHIPPING config builder and the SHIPPING
// partition key, never a restatement of them that could drift.
import { tunnelProxyConfig, assertFailClosed } from '../packages/security-policy/src/egress-proxy';
import { partitionKeyFor } from '../packages/tab-engine/src/connection-binding';
import { startSocks5, type TestSocksServer } from './socks5-test-server';

/**
 * SPIKE (make-or-break, isolated): the automated leak test Phase 5's DoD asks for, run against the
 * SHIPPING app's Chromium and the SHIPPING proxy-config builder (`tunnelProxyConfig` +
 * `assertFailClosed` are imported from `@tepegoz/security-policy`, not restated here).
 *
 * The phase file recorded that this test "cannot exist until `session.setProxy` wiring lands, because
 * there is no real egress path for it to test". Both halves of that are addressed here without waiting
 * on a shipped WireGuard/Tor binary: the wiring exists (`main/network/tunnel-session.electron.ts`), and
 * the egress path is a real local SOCKS5 endpoint stood up in-process.
 *
 * Two properties, each with a detector that can actually see its own failure:
 *
 *   A. **Routed, with remote DNS.** A tunnel-bound session reaches a host it cannot resolve locally
 *      (`.test` has no DNS), and the SOCKS server records the request as DOMAINNAME — proving the
 *      hostname was resolved by the proxy, not by the user's ISP resolver.
 *   B. **Fail-closed on drop.** With the resolver pointed at a reachable address (so a clear-path
 *      request WOULD succeed, verified by an untunneled control that hits the direct origin), the tunnel
 *      is killed mid-session. The next request must fail and the direct origin must record NOTHING. The
 *      control request is what makes this a measurement rather than a tautology: without it, "no direct
 *      hit" could just mean the detector was blind.
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

/** An HTTP origin that records every path it is asked for and answers with its own name. */
async function startOrigin(name: string): Promise<Origin> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(name);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return {
    port: (server.address() as AddressInfo).port,
    hits,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

interface FetchResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/** Issue a request from the MAIN process on a given partition (null = the app's default session). */
async function fetchVia(
  app: ElectronApplication,
  partition: string | null,
  url: string,
): Promise<FetchResult> {
  return app.evaluate(
    async ({ net }, arg: { partition: string | null; url: string }): Promise<FetchResult> =>
      new Promise<FetchResult>((done) => {
        const request =
          arg.partition === null
            ? net.request(arg.url)
            : net.request({ url: arg.url, partition: arg.partition });
        let body = '';
        request.on('response', (response) => {
          response.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          response.on('end', () => done({ ok: true, status: response.statusCode, body }));
        });
        request.on('error', (err: Error) => done({ ok: false, error: String(err) }));
        request.end();
      }),
    { partition, url },
  );
}

/** Apply the PRODUCTION proxy config to a partition in the main process, and report what it resolves to. */
async function bindTunnel(
  app: ElectronApplication,
  partition: string,
  socksPort: number,
): Promise<string> {
  const config = tunnelProxyConfig(socksPort);
  assertFailClosed(config); // the same gate `ensureTunnelSession` runs before it ever calls setProxy
  return app.evaluate(
    async ({ session }, arg: { partition: string; config: ReturnType<typeof tunnelProxyConfig> }) => {
      const ses = session.fromPartition(arg.partition);
      await ses.setProxy(arg.config);
      return ses.resolveProxy('https://tepegoz-proxy-probe.invalid/');
    },
    { partition, config },
  );
}

async function launch(
  profileTag: string,
  extraArgs: string[],
): Promise<[ElectronApplication, string]> {
  const profileDir = join(process.cwd(), `.spike-profile-${profileTag}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, ...extraArgs, appDir],
    env: guiEnv(),
  });
  return [app, profileDir];
}

test('A. a tunnel-bound session routes through the SOCKS endpoint, resolving DNS remotely', async () => {
  test.setTimeout(120_000);
  const tunnelOrigin = await startOrigin('VIA-TUNNEL');
  const socks: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: tunnelOrigin.port });
  const [app, profileDir] = await launch(`tunnel-a-${socks.port}`, []);

  try {
    const partition = partitionKeyFor({ connectionId: 'spike-a' });
    const resolved = await bindTunnel(app, partition, socks.port);
    expect(resolved).toMatch(/^SOCKS5? /);

    // `.test` cannot resolve anywhere: reaching this at all is only possible through the proxy. The
    // port is an ordinary ephemeral one because Chromium refuses a set of "restricted" low ports
    // outright (ERR_UNSAFE_PORT) before any proxy is consulted — the SOCKS server forwards every
    // CONNECT to the same origin regardless of the port asked for, so the value itself is irrelevant.
    const viaTunnel = await fetchVia(
      app,
      partition,
      `http://${PROBE_HOST}:${tunnelOrigin.port}/through-tunnel`,
    );
    expect(viaTunnel.ok).toBe(true);
    expect(viaTunnel.body).toBe('VIA-TUNNEL');
    expect(tunnelOrigin.hits).toContain('/through-tunnel');

    // REMOTE DNS: the proxy was handed the hostname, not an address the browser had already resolved.
    expect(socks.requests).toHaveLength(1);
    expect(socks.requests[0]?.atyp).toBe(3); // 3 = DOMAINNAME
    expect(socks.requests[0]?.host).toBe(PROBE_HOST);
  } finally {
    await app.close();
    await socks.close();
    await tunnelOrigin.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('B. when the tunnel drops, egress FAILS — it never falls back to the clear path', async () => {
  test.setTimeout(120_000);
  const tunnelOrigin = await startOrigin('VIA-TUNNEL');
  const directOrigin = await startOrigin('CLEAR-PATH');
  const socks: TestSocksServer = await startSocks5({ host: '127.0.0.1', port: tunnelOrigin.port });

  // The resolver rule is what makes the leak DETECTOR sighted: with it, a clear-path request for
  // PROBE_HOST reaches `directOrigin` and is recorded. Without it, "no direct hit" would prove nothing.
  const [app, profileDir] = await launch(`tunnel-b-${socks.port}`, [
    `--host-resolver-rules=MAP ${PROBE_HOST} 127.0.0.1`,
  ]);

  try {
    const clearUrl = `http://${PROBE_HOST}:${directOrigin.port}`;

    // Control: the clear path IS reachable and IS observed. If this fails, every assertion below is void.
    const control = await fetchVia(app, null, `${clearUrl}/control`);
    expect(control.ok).toBe(true);
    expect(control.body).toBe('CLEAR-PATH');
    expect(directOrigin.hits).toEqual(['/control']);

    const partition = partitionKeyFor({ connectionId: 'spike-b' });
    await bindTunnel(app, partition, socks.port);

    // Tunnel up: the same URL goes to the SOCKS endpoint, NOT to the reachable direct origin.
    const up = await fetchVia(app, partition, `${clearUrl}/while-up`);
    expect(up.ok).toBe(true);
    expect(up.body).toBe('VIA-TUNNEL');
    expect(directOrigin.hits).toEqual(['/control']);

    // ── The tunnel drops ──
    await socks.close();

    const afterDrop = await fetchVia(app, partition, `${clearUrl}/after-drop`);
    expect(afterDrop.ok).toBe(false);
    expect(afterDrop.error ?? '').toMatch(/PROXY|TUNNEL|SOCKS|CONNECTION/i);

    // The whole point: nothing reached the clear path, though the clear path was proven reachable.
    expect(directOrigin.hits).toEqual(['/control']);
    expect(tunnelOrigin.hits).not.toContain('/after-drop');
  } finally {
    await app.close();
    await socks.close();
    await directOrigin.close();
    await tunnelOrigin.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
