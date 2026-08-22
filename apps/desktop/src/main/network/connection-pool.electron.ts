import { AppError, Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { partitionKeyFor } from '@tepegoz/tab-engine';
import type { ConnectionStatus } from '@tepegoz/security-policy';
import type { LiveConnectionStatus, NetworkConnection } from '@tepegoz/shared-types';
import BrowsingSessions from './browsing-sessions.electron';
import { ByoSocksProvider, type NetworkPrivacyProvider } from './connection-provider.electron';
import { WireGuardProvider } from './wireguard-provider.electron';
import { TorProvider } from './tor-provider.electron';
import {
  blackholeTunnelSession,
  ensureTunnelSession,
  invalidateTunnelVerification,
} from './tunnel-session.electron';

/**
 * The pool of network-privacy connections — the thing that makes "multiple tunnels up at once" real, and
 * the thing that tells the kill-switch which of them are actually alive.
 *
 * Main process only. The renderer never sees a provider, a port, or a session; it gets a view object and
 * a status, over the typed bridge. That is not ceremony: a renderer that could reach a tunnel handle
 * could also be talked into reaching one by a page.
 *
 * Two design points worth stating, because both are places this could quietly go wrong:
 *
 * 1. **`connecting` is not a third state for the kill-switch.** {@link statusMap} reports only `up` or
 *    `down`, and anything that is not confirmed up is reported down. A connection mid-handshake is not
 *    evidence that its tabs may egress; `killSwitchVerdicts` blocks on `down` and on ids it has never
 *    heard of, and this keeps that guarantee true by never handing it an optimistic third value.
 * 2. **Bringing a connection up is not "the provider said yes".** It is: the provider's endpoint answers,
 *    AND the session for it exists fully wired, AND Chromium confirms the proxy actually took effect
 *    (`ensureTunnelSession` verifies with `resolveProxy`). If any of those fails the connection stays
 *    down, because a connection reported `up` that cannot carry traffic is precisely the state in which a
 *    user believes they are protected and are not.
 */

/** How often live connections are re-probed. Short enough that a dropped tunnel is noticed in seconds. */
const HEALTH_INTERVAL_MS = 15_000;

/** What the renderer and the menus see. No ports, no handles — a label, a note, and a health light. */
export interface PoolConnectionView {
  id: string;
  label: string;
  note: string;
  kind: NetworkConnection['kind'];
  status: LiveConnectionStatus;
  /** Which connection this one chains through, if any (Tor over VPN). */
  upstreamConnectionId: string | null;
  /** Why it is not up, in the provider's own words — shown as-is, because "wireproxy not found" and
   *  "endpoint unreachable" need entirely different things from the user. */
  lastError: string | null;
}

interface Entry {
  config: NetworkConnection;
  provider: NetworkPrivacyProvider;
  status: LiveConnectionStatus;
  /** The loopback port this connection is currently answering on; `null` whenever it is not up. Kept so
   *  a chained connection (Tor over VPN) can be pointed at its upstream's live port. */
  socksPort: number | null;
  /** Why this connection is not up, in the user's words. Cleared on a successful connect. */
  lastError: string | null;
}

type StatusListener = (id: string, status: LiveConnectionStatus) => void;

const entries = new Map<string, Entry>();
const listeners = new Set<StatusListener>();
/** Ids whose `ensureUp` is in flight — the cycle guard for chained connections (Tor over VPN). */
const connecting = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Build the provider for a configured connection.
 *
 * The only place in the pool that knows protocols exist. Everything else — health, status, the
 * kill-switch feed, partitions — works against "something that hands back a loopback SOCKS port", which
 * is why adding a protocol is a case in this switch and nothing more.
 */
function providerFor(config: NetworkConnection): NetworkPrivacyProvider {
  switch (config.kind) {
    case 'byo-socks':
      return new ByoSocksProvider(config.socksPort);
    case 'wireguard':
      return new WireGuardProvider(config.id);
    case 'tor':
      return new TorProvider(
        config.id,
        // Chaining is resolved lazily, at connect time, so the upstream's CURRENT port is used — a
        // wireproxy restart lands on a new ephemeral port, and a value captured at construction would
        // quietly point Tor at whatever now holds the old one.
        config.upstreamConnectionId === null
          ? null
          : async () => {
              const up = await ConnectionPool.ensureUp(config.upstreamConnectionId as string);
              if (up.socksPort === null) {
                throw new Error(
                  `Upstream connection ${String(config.upstreamConnectionId)} exposed no port`,
                );
              }
              return up.socksPort;
            },
      );
    default: {
      // Exhaustive: every `kind` in the schema union has a case above. If one is added without a
      // provider, this throws at load time rather than producing a connection that cannot connect.
      const unreachable: never = config;
      throw new Error(`No provider for connection kind: ${JSON.stringify(unreachable)}`);
    }
  }
}

function setStatus(id: string, status: LiveConnectionStatus): void {
  const entry = entries.get(id);
  if (entry === undefined || entry.status === status) return;
  entry.status = status;
  Logger.info('Connection status changed', { id, status });
  if (status === 'down') {
    // Not merely bookkeeping. A dead SOCKS port fails closed only while it stays dead; loopback ports get
    // recycled, and an unrelated local process that later binds this one would inherit a browser
    // partition pointing straight at it. Blackholing makes the down state independent of that, and
    // dropping the verification forces the way back up through `resolveProxy` again.
    void blackholeTunnelSession(id);
  }
  for (const listener of listeners) {
    try {
      listener(id, status);
    } catch (err) {
      Logger.warn('Connection status listener failed', { id, err: String(err) });
    }
  }
}

function viewOf(entry: Entry): PoolConnectionView {
  return {
    id: entry.config.id,
    label: entry.config.label,
    note: entry.config.note,
    kind: entry.config.kind,
    status: entry.status,
    upstreamConnectionId: entry.config.kind === 'tor' ? entry.config.upstreamConnectionId : null,
    lastError: entry.lastError,
  };
}

const ConnectionPool = {
  /** Load the persisted connections. Nothing is brought up here: a connection comes up when something
   *  actually binds to it, so a configured-but-unused endpoint is never probed behind the user's back. */
  init(): void {
    entries.clear();
    for (const config of PreferenceStore.getAll().networkConnections) {
      try {
        entries.set(config.id, {
          config,
          provider: providerFor(config),
          status: 'down',
          socksPort: null,
          lastError: null,
        });
      } catch (err) {
        // A persisted config we cannot build a provider for is reported, not silently dropped from view:
        // a connection the user configured and cannot see is worse than one shown as broken.
        Logger.error('Skipping an unusable network connection', {
          id: config.id,
          err: String(err),
        });
      }
    }
    Logger.info('Connection pool loaded', { count: entries.size });
  },

  list(): PoolConnectionView[] {
    return [...entries.values()].map(viewOf);
  },

  get(id: string): PoolConnectionView | undefined {
    const entry = entries.get(id);
    return entry === undefined ? undefined : viewOf(entry);
  },

  has(id: string): boolean {
    return entries.has(id);
  },

  /**
   * Health as the kill-switch consumes it: `up` or `down`, never anything softer.
   *
   * A connection that is configured but has never been brought up simply has no entry here, and
   * `killSwitchVerdicts` blocks a tab resolved to it with `unknown_connection_failclosed`. Silence about
   * a connection's health is not evidence that it is healthy.
   */
  statusMap(): ReadonlyMap<string, ConnectionStatus> {
    const map = new Map<string, ConnectionStatus>();
    for (const [id, entry] of entries) map.set(id, entry.status === 'up' ? 'up' : 'down');
    return map;
  },

  onStatusChange(listener: StatusListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Bring a connection up and prove it carries traffic, or leave it down. Never throws for "already up".
   *
   * Returns the session partition the connection routes through, which is what the binding layer needs
   * in order to re-host a tab on it.
   */
  async ensureUp(id: string): Promise<{ partition: string; socksPort: number | null }> {
    const entry = entries.get(id);
    if (entry === undefined) {
      throw new AppError(`No such connection: ${id}`, 404, 'networkNoSuchConnection');
    }
    const partition = partitionKeyFor({ connectionId: id });
    if (entry.status === 'up') return { partition, socksPort: entry.socksPort };

    // A chained connection resolves its upstream by calling back into this function. Without a guard, a
    // config where A chains to B and B chains back to A would recurse until the stack gave out — so the
    // cycle is refused with a message naming it, rather than crashing the main process.
    if (connecting.has(id)) {
      throw new AppError(`Connection chain loops back to ${id}`, 409, 'networkChainLoop');
    }
    connecting.add(id);
    setStatus(id, 'connecting');
    try {
      const { socksPort } = await entry.provider.connect();
      const bind = await ensureTunnelSession(id, socksPort);
      entry.socksPort = socksPort;
      entry.lastError = null;
      setStatus(id, 'up');
      ConnectionPool.startHealthPolling();
      return { partition: bind.partition, socksPort };
    } catch (err) {
      entry.socksPort = null;
      // Kept verbatim for the UI: "wireproxy not found" and "endpoint unreachable" need entirely
      // different things from the user, and a generic "could not connect" tells them neither.
      entry.lastError = err instanceof Error ? err.message : String(err);
      setStatus(id, 'down');
      Logger.error('Connection failed to come up', { id, err: String(err) });
      throw err;
    } finally {
      connecting.delete(id);
    }
  },

  /** Mark a connection down and release the provider. The session partition stays — the tabs on it are
   *  blocked by the kill-switch, not evicted, and their storage belongs to the user until they remove
   *  the connection outright. */
  async takeDown(id: string): Promise<void> {
    const entry = entries.get(id);
    if (entry === undefined) return;
    setStatus(id, 'down');
    entry.socksPort = null;
    invalidateTunnelVerification(id);
    await entry.provider.disconnect();
  },

  /** Add (or replace) a configured connection and persist it. */
  add(config: NetworkConnection): void {
    entries.set(config.id, {
      config,
      provider: providerFor(config),
      status: 'down',
      socksPort: null,
      lastError: null,
    });
    const rest = PreferenceStore.getAll().networkConnections.filter((c) => c.id !== config.id);
    PreferenceStore.update({ networkConnections: [...rest, config] });
  },

  /**
   * Remove a connection for good: take it down, forget the config, and WIPE its partition.
   *
   * The wipe is the part that is easy to leave out and matters most. Electron can clear a partition's
   * contents but cannot delete its directory, so without this the cookies from a "private" tunnel sit on
   * disk indefinitely under a name nothing reads any more — the exact opposite of what a user means when
   * they delete a VPN connection.
   */
  async remove(id: string): Promise<void> {
    await ConnectionPool.takeDown(id);
    entries.delete(id);
    PreferenceStore.update({
      networkConnections: PreferenceStore.getAll().networkConnections.filter((c) => c.id !== id),
    });
    try {
      await BrowsingSessions.release(partitionKeyFor({ connectionId: id }));
    } catch (err) {
      Logger.error('Removed a connection but could not wipe its partition', {
        id,
        err: String(err),
      });
    }
  },

  /** Begin (or continue) re-probing live connections. Idempotent; stops on its own when none are up. */
  startHealthPolling(intervalMs = HEALTH_INTERVAL_MS): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      void ConnectionPool.pollOnce();
    }, intervalMs);
    // Never hold the process open for a health check.
    timer.unref?.();
  },

  stopHealthPolling(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  },

  /**
   * One health sweep. Probes every connection that is up (has it dropped?) — and only those: probing a
   * connection nobody is using would be the browser touching an endpoint the user never asked it to.
   */
  async pollOnce(): Promise<void> {
    const live = [...entries.values()].filter((e) => e.status === 'up');
    if (live.length === 0) {
      ConnectionPool.stopHealthPolling();
      return;
    }
    await Promise.all(
      live.map(async (entry) => {
        const alive = await entry.provider.probe();
        if (!alive) {
          Logger.warn('Connection dropped', { id: entry.config.id });
          invalidateTunnelVerification(entry.config.id);
          setStatus(entry.config.id, 'down');
        }
      }),
    );
  },

  resetForTests(): void {
    ConnectionPool.stopHealthPolling();
    entries.clear();
    listeners.clear();
  },
};

export default ConnectionPool;
