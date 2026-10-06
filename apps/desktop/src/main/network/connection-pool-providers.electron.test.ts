import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkConnection } from '@tepegoz/shared-types';
import { conn, wgConn, torConn } from './connection-pool.electron.test-kit';

/**
 * `ConnectionPool` — `providerFor` (the one place that knows protocols exist) and `newIdentity`.
 */

const h = vi.hoisted(() => ({
  prefs: { networkConnections: [] as NetworkConnection[] },
  update: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  probe: vi.fn(),
  ensureTunnelSession: vi.fn(),
  invalidateTunnelVerification: vi.fn(),
  blackholeTunnelSession: vi.fn(),
  release: vi.fn(),
  wipe: vi.fn(),
  wgCtor: vi.fn(),
  torCtor: vi.fn<(id: string, resolver: (() => Promise<number>) | null) => void>(),
}));

vi.mock('electron', () => ({ session: { fromPartition: (partition: string) => ({ partition }) } }));
vi.mock('@tepegoz/preferences', () => ({
  default: {
    getAll: () => h.prefs,
    update: (patch: Partial<typeof h.prefs>) => {
      h.update(patch);
      Object.assign(h.prefs, patch);
    },
  },
}));
vi.mock('./connection-provider.electron', () => ({
  ByoSocksProvider: class {
    readonly kind = 'byo-socks' as const;
    connect = h.connect;
    disconnect = h.disconnect;
    probe = h.probe;
  },
}));
vi.mock('./wireguard-provider.electron', () => ({
  WireGuardProvider: class {
    readonly kind = 'wireguard' as const;
    connect = h.connect;
    disconnect = h.disconnect;
    probe = h.probe;
    constructor(id: string) {
      h.wgCtor(id);
    }
  },
}));
vi.mock('./tor-provider.electron', () => ({
  TorProvider: class {
    readonly kind = 'tor' as const;
    connect = h.connect;
    disconnect = h.disconnect;
    probe = h.probe;
    constructor(id: string, resolver: (() => Promise<number>) | null) {
      h.torCtor(id, resolver);
    }
  },
}));
vi.mock('./tunnel-session.electron', () => ({
  ensureTunnelSession: h.ensureTunnelSession,
  invalidateTunnelVerification: h.invalidateTunnelVerification,
  blackholeTunnelSession: h.blackholeTunnelSession,
}));
vi.mock('./browsing-sessions.electron', () => ({
  default: { release: h.release, wipe: h.wipe },
}));

const { default: ConnectionPool } = await import('./connection-pool.electron');

beforeEach(() => {
  ConnectionPool.resetForTests();
  h.prefs.networkConnections = [];
  for (const fn of [
    h.update,
    h.connect,
    h.disconnect,
    h.probe,
    h.ensureTunnelSession,
    h.invalidateTunnelVerification,
    h.blackholeTunnelSession,
    h.release,
    h.wipe,
    h.wgCtor,
    h.torCtor,
  ]) {
    fn.mockReset();
  }
  h.blackholeTunnelSession.mockResolvedValue(undefined);
  h.connect.mockResolvedValue({ socksPort: 9050 });
  h.disconnect.mockResolvedValue(undefined);
  h.probe.mockResolvedValue(true);
  h.ensureTunnelSession.mockResolvedValue({
    connectionId: 'tor',
    partition: 'persist:tepegoz-web--conn-tor',
    session: {},
  });
  h.release.mockResolvedValue(undefined);
  h.wipe.mockResolvedValue(undefined);
});

describe('providerFor — the one place that knows protocols exist', () => {
  it('builds a WireGuardProvider from the connection id', () => {
    ConnectionPool.init();
    ConnectionPool.add(wgConn('wg1'));
    expect(h.wgCtor).toHaveBeenCalledWith('wg1');
    expect(ConnectionPool.has('wg1')).toBe(true);
  });

  it('builds a TorProvider with a null upstream resolver when the connection does not chain', () => {
    ConnectionPool.init();
    ConnectionPool.add(torConn('t1', null));
    expect(h.torCtor).toHaveBeenCalledWith('t1', null);
  });

  it('builds a TorProvider with a LAZY upstream-port resolver when it chains', async () => {
    h.prefs.networkConnections = [conn('up', 1080)];
    ConnectionPool.init();
    ConnectionPool.add(torConn('t2', 'up'));

    const resolver = h.torCtor.mock.calls[0]![1];
    expect(typeof resolver).toBe('function');

    // Resolved at connect time against the upstream's CURRENT port.
    h.connect.mockResolvedValueOnce({ socksPort: 1080 });
    await expect(resolver!()).resolves.toBe(1080);
  });

  it('the chain resolver throws when the upstream exposed no port', async () => {
    h.prefs.networkConnections = [conn('up', 1080)];
    ConnectionPool.init();
    ConnectionPool.add(torConn('t3', 'up'));
    const resolver = h.torCtor.mock.calls[0]![1]!;

    h.connect.mockResolvedValueOnce({ socksPort: null });
    await expect(resolver()).rejects.toThrow(/exposed no port/);
  });

  it('refuses a chain that loops back on itself', async () => {
    ConnectionPool.init();
    ConnectionPool.add(torConn('loop', 'loop'));
    const resolver = h.torCtor.mock.calls[0]![1]!;

    // Drive it from inside its own `ensureUp` so the cycle guard sees `connecting` already holds the id.
    h.connect.mockImplementationOnce(() => resolver().then(() => ({ socksPort: 9050 })));
    await expect(ConnectionPool.ensureUp('loop')).rejects.toThrow(/loops back to loop/);
    expect(ConnectionPool.statusMap().get('loop')).toBe('down');
  });

  it('reports — does not silently drop — a persisted connection whose kind has no provider', () => {
    h.prefs.networkConnections = [
      { ...conn('weird'), kind: 'quantum-link' } as unknown as NetworkConnection,
    ];
    ConnectionPool.init();
    // The exhaustive `never` default threw; init caught it, so the pool loads with nothing.
    expect(ConnectionPool.list()).toEqual([]);
  });
});

describe('newIdentity — new circuits AND a clean jar, or neither', () => {
  /**
   * The order is the security property, not a detail. Between "burn the circuits" and "wipe the site
   * state" there is a window where a tab could still egress on the connection, and a wipe racing a
   * live page is a wipe that misses what the page writes next. Taking the connection DOWN first closes
   * it: the kill-switch holds every tab bound to it while the jar is emptied.
   */
  it('goes down, wipes the partition, and only then comes back up', async () => {
    const order: string[] = [];
    h.disconnect.mockImplementation(() => {
      order.push('down');
      return Promise.resolve();
    });
    h.wipe.mockImplementation(() => {
      order.push('wipe');
      return Promise.resolve();
    });
    h.connect.mockImplementation(() => {
      order.push('up');
      return Promise.resolve({ socksPort: 9050 });
    });

    h.prefs.networkConnections = [torConn('t1', null)];
    ConnectionPool.init();
    await ConnectionPool.ensureUp('t1');
    order.length = 0;

    await expect(ConnectionPool.newIdentity('t1')).resolves.toEqual({ reconnected: true });
    expect(order).toEqual(['down', 'wipe', 'up']);
    expect(h.wipe).toHaveBeenCalledWith('persist:tepegoz-web--conn-t1');
    expect(ConnectionPool.get('t1')?.status).toBe('up');
  });

  it('does NOT dial a connection the user had left down — it only cleans it', async () => {
    // A privacy action must not become a reason the browser opened a tunnel nobody asked it to open.
    h.prefs.networkConnections = [torConn('t1', null)];
    ConnectionPool.init();
    await expect(ConnectionPool.newIdentity('t1')).resolves.toEqual({ reconnected: false });
    expect(h.wipe).toHaveBeenCalledTimes(1);
    expect(h.connect).not.toHaveBeenCalled();
    expect(ConnectionPool.get('t1')?.status).toBe('down');
  });

  it('refuses a non-Tor connection rather than renaming a reconnect', async () => {
    // A WireGuard or SOCKS reconnect lands on the same exit address, so "new identity" there would be
    // a claim the product cannot keep. Refused in main, not merely hidden in the UI.
    h.prefs.networkConnections = [wgConn('wg1')];
    ConnectionPool.init();
    await expect(ConnectionPool.newIdentity('wg1')).rejects.toMatchObject({
      code: 'networkNewIdentityNotTor',
      statusCode: 400,
    });
    expect(h.wipe).not.toHaveBeenCalled();
  });

  it('refuses an unknown connection', async () => {
    ConnectionPool.init();
    await expect(ConnectionPool.newIdentity('nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not bring the connection back when the wipe fails — a dirty jar is not a new identity', async () => {
    h.prefs.networkConnections = [torConn('t1', null)];
    ConnectionPool.init();
    await ConnectionPool.ensureUp('t1');
    h.wipe.mockRejectedValue(new Error('locked'));
    h.connect.mockClear();
    await expect(ConnectionPool.newIdentity('t1')).rejects.toThrow('locked');
    // Left DOWN on purpose: coming back up would hand the user a connection carrying the identity
    // they just asked to destroy, with nothing on screen saying the wipe did not happen.
    expect(h.connect).not.toHaveBeenCalled();
    expect(ConnectionPool.get('t1')?.status).toBe('down');
  });
});
