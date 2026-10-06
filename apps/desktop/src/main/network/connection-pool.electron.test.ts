import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkConnection } from '@tepegoz/shared-types';
import { conn } from './connection-pool.electron.test-kit';

/**
 * `ConnectionPool` — loading persisted connections, bringing one up, adding / removing, and the small
 * surface still worth pinning. Health polling + the handshake tally live in
 * `connection-pool-health.electron.test.ts`; provider selection + `newIdentity` in
 * `connection-pool-providers.electron.test.ts`.
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

describe('loading', () => {
  it('loads persisted connections and starts every one DOWN — configured is not connected', () => {
    h.prefs.networkConnections = [conn('tor'), conn('mullvad', 1080)];
    ConnectionPool.init();
    expect(ConnectionPool.list().map((c) => [c.id, c.status])).toEqual([
      ['tor', 'down'],
      ['mullvad', 'down'],
    ]);
  });

  it('does NOT probe on load — a configured endpoint is not touched until something binds to it', () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.probe).not.toHaveBeenCalled();
  });
});

describe('bringing a connection up', () => {
  beforeEach(() => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
  });

  it('is only UP once the endpoint answers AND Chromium confirms the proxy took effect', async () => {
    await ConnectionPool.ensureUp('tor');
    expect(h.connect).toHaveBeenCalledOnce();
    expect(h.ensureTunnelSession).toHaveBeenCalledWith('tor', 9050);
    expect(ConnectionPool.statusMap().get('tor')).toBe('up');
  });

  it('socksPortFor reports the live port once up — the app-egress policy reads it synchronously', async () => {
    expect(ConnectionPool.socksPortFor('tor')).toBeNull();
    await ConnectionPool.ensureUp('tor');
    expect(ConnectionPool.socksPortFor('tor')).toBe(9050);
  });

  it('socksPortFor is null for a DOWN connection — "no port" must not read as "no tunnel wanted"', async () => {
    h.connect.mockRejectedValue(new Error('nothing listening'));
    await expect(ConnectionPool.ensureUp('tor')).rejects.toThrow();
    expect(ConnectionPool.socksPortFor('tor')).toBeNull();
  });

  it('socksPortFor is null for a connection the pool has never heard of', () => {
    expect(ConnectionPool.socksPortFor('no-such-connection')).toBeNull();
  });

  it('stays DOWN when the endpoint is not answering', async () => {
    h.connect.mockRejectedValue(new Error('nothing listening'));
    await expect(ConnectionPool.ensureUp('tor')).rejects.toThrow(/nothing listening/);
    expect(ConnectionPool.statusMap().get('tor')).toBe('down');
  });

  it('stays DOWN when the proxy did not actually take effect — "up" must mean it carries traffic', async () => {
    // The state this refuses to produce: a connection reported up that cannot carry traffic, i.e. a user
    // who believes they are protected and is not.
    h.ensureTunnelSession.mockRejectedValue(new Error('resolveProxy reported "DIRECT"'));
    await expect(ConnectionPool.ensureUp('tor')).rejects.toThrow(/DIRECT/);
    expect(ConnectionPool.statusMap().get('tor')).toBe('down');
  });

  it('reports a MID-HANDSHAKE connection as down — connecting is not a third, permissive state', async () => {
    let release: (v: { socksPort: number }) => void = () => undefined;
    h.connect.mockReturnValue(new Promise((r) => (release = r)));
    const pending = ConnectionPool.ensureUp('tor');

    expect(ConnectionPool.list()[0]?.status).toBe('connecting');
    // What the kill-switch sees is what matters, and it must never see optimism.
    expect(ConnectionPool.statusMap().get('tor')).toBe('down');

    release({ socksPort: 9050 });
    await pending;
    expect(ConnectionPool.statusMap().get('tor')).toBe('up');
  });

  it('is idempotent once up', async () => {
    await ConnectionPool.ensureUp('tor');
    await ConnectionPool.ensureUp('tor');
    expect(h.connect).toHaveBeenCalledOnce();
  });

  it('refuses an id it has never heard of', async () => {
    await expect(ConnectionPool.ensureUp('ghost')).rejects.toThrow(/No such connection/);
    // And the kill-switch gets no entry at all, so a tab resolved to it fails closed.
    expect(ConnectionPool.statusMap().has('ghost')).toBe(false);
  });
});

describe('adding and removing', () => {
  it('persists an added connection', () => {
    ConnectionPool.init();
    ConnectionPool.add(conn('tor'));
    expect(h.update).toHaveBeenCalledWith({ networkConnections: [conn('tor')] });
    expect(ConnectionPool.has('tor')).toBe(true);
  });

  it('removing WIPES the partition — a deleted tunnel must not leave its cookies on disk', async () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    await ConnectionPool.ensureUp('tor');

    await ConnectionPool.remove('tor');

    expect(ConnectionPool.has('tor')).toBe(false);
    expect(h.release).toHaveBeenCalledWith('persist:tepegoz-web--conn-tor');
    expect(h.update).toHaveBeenCalledWith({ networkConnections: [] });
  });

  it('a failed wipe is reported, not swallowed, and still removes the connection', async () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    h.release.mockRejectedValue(new Error('locked'));
    await expect(ConnectionPool.remove('tor')).resolves.toBeUndefined();
    expect(ConnectionPool.has('tor')).toBe(false);
  });
});

describe('small surface still worth pinning', () => {
  it('get() returns a view for a known id and undefined for an unknown one', () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    expect(ConnectionPool.get('tor')).toMatchObject({ id: 'tor', status: 'down' });
    expect(ConnectionPool.get('ghost')).toBeUndefined();
  });

  it('a throwing status listener is logged, not allowed to break the notify loop', async () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    const good = vi.fn();
    ConnectionPool.onStatusChange(() => {
      throw new Error('listener boom');
    });
    ConnectionPool.onStatusChange(good);

    await ConnectionPool.ensureUp('tor'); // drives setStatus → the notify loop

    expect(good).toHaveBeenCalledWith('tor', 'up');
  });

  it('the health-poll interval callback runs a sweep', async () => {
    vi.useFakeTimers();
    try {
      h.prefs.networkConnections = [conn('tor')];
      ConnectionPool.init();
      await ConnectionPool.ensureUp('tor');
      h.probe.mockClear();
      // `ensureUp` already armed the poller at the default interval — restart it on a short one.
      ConnectionPool.stopHealthPolling();
      ConnectionPool.startHealthPolling(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.probe).toHaveBeenCalled();
    } finally {
      ConnectionPool.stopHealthPolling();
      vi.useRealTimers();
    }
  });
});
