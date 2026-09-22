import { AppError, Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import type {
  ConnectionTestResult,
  NetworkConnection,
  NetworkTestStage,
} from '@tepegoz/shared-types';
import ConnectionPool from './connection-pool.electron';
import VpnSecrets from './vpn-secrets.electron';
import { parseWireGuardConfig } from './wireguard-config';

/**
 * The manual "test this connection" flow (Phase 5 onboarding gap: "import a config, name it, test it,
 * and see a plain-language result; a failed test says which step failed").
 *
 * This runs AFTER a connection has been added through the existing form — `AddConnectionRow` already
 * parses a WireGuard profile at pick time and again at commit, so a connection that exists in the pool
 * has always passed a config parse once. What this adds is a way to check it again, on demand, and to
 * see a real handshake attempt broken out from that check rather than folded into one opaque
 * "could not connect". It invents no new way to bring a tunnel up: the handshake stage is exactly
 * `ConnectionPool.ensureUp`, the same call the manual Connect button and the kill-switch's own recovery
 * path already make.
 *
 * DNS-through-the-tunnel and exit reachability are NOT independently distinguished here — see
 * `ConnectionTestResultSchema`'s docstring in `@tepegoz/shared-types` for why: the only reusable signal
 * past a successful handshake is `ensureTunnelSession`'s `resolveProxy` check (already inside `ensureUp`),
 * which proves the session's proxy config took effect, not that the tunnel can resolve a name or reach a
 * real destination. Both fold into one coarse `reachability` result instead of a fabricated per-stage
 * pass — building either as a real, distinct check would mean new probing logic inside the pool/provider
 * connect path, which this change deliberately does not touch.
 */

function pass(): NetworkTestStage {
  return { status: 'pass', detail: null };
}

function fail(detail: string): NetworkTestStage {
  return { status: 'fail', detail };
}

function skipped(): NetworkTestStage {
  return { status: 'skipped', detail: null };
}

/**
 * Re-validate a SAVED connection's configuration, synchronously and with no network attempt — the
 * cheapest, most reliable stage, and the reason it runs first. Reuses the exact checks the connection
 * already passed at add time, so a failure here means something has changed SINCE (a keychain that
 * stopped decrypting a WireGuard profile, a Tor upstream that was since removed) rather than a second,
 * parallel notion of validity.
 */
function testConfigParse(config: NetworkConnection): NetworkTestStage {
  if (config.kind === 'wireguard') {
    const stored = VpnSecrets.read(config.id);
    if (stored === null) {
      // The exact message `WireGuardProvider.connect()` throws for the same condition — `classifyNetworkError`
      // already maps it to `badConfig`, so the test flow and a live connect failure read the same way.
      return fail('This connection has no stored WireGuard profile (or it could not be decrypted)');
    }
    try {
      parseWireGuardConfig(stored);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    return pass();
  }
  if (config.kind === 'tor') {
    if (config.upstreamConnectionId !== null && !ConnectionPool.has(config.upstreamConnectionId)) {
      // Same wording `networkAddConnection` uses for the same condition (`classifyNetworkError` → `noSuchConnection`).
      return fail(`No such upstream connection: ${config.upstreamConnectionId}`);
    }
    return pass();
  }
  // byo-socks: the port range is enforced by the schema at add time and again by the provider's own
  // constructor, so a saved connection's port is always in range — nothing further to check statically.
  return pass();
}

const ConnectionTest = {
  /**
   * Run the full test against a SAVED connection: config parse, then (only if that passed) a real
   * handshake attempt via `ConnectionPool.ensureUp`.
   */
  async testConnection(id: string): Promise<ConnectionTestResult> {
    const config = PreferenceStore.getAll().networkConnections.find((c) => c.id === id);
    if (config === undefined) {
      throw new AppError(`No such connection: ${id}`, 404, 'networkNoSuchConnection');
    }

    const configParse = testConfigParse(config);
    if (configParse.status === 'fail') {
      Logger.info('Connection test stopped at config parse', { id });
      return { connectionId: id, configParse, handshake: skipped(), reachability: 'notReached' };
    }

    try {
      await ConnectionPool.ensureUp(id);
      Logger.info('Connection test reached a live handshake', { id });
      return { connectionId: id, configParse, handshake: pass(), reachability: 'unverified' };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      Logger.info('Connection test stopped at handshake', { id, detail });
      return { connectionId: id, configParse, handshake: fail(detail), reachability: 'notReached' };
    }
  },
};

export default ConnectionTest;
