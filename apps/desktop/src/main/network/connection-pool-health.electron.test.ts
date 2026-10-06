import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkConnection } from '@tepegoz/shared-types';
import { conn } from './connection-pool.electron.test-kit';

/**
 * `ConnectionPool` — health polling and the session-scoped handshake tally that feeds the health overview.
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

describe('health polling', () => {
  beforeEach(async () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.init();
    await ConnectionPool.ensureUp('tor');
  });

  it('flips a dropped connection to down and tells its listeners', async () => {
    const seen: [string, string][] = [];
    ConnectionPool.onStatusChange((id, status) => seen.push([id, status]));
    h.probe.mockResolvedValue(false);

    await ConnectionPool.pollOnce();

    expect(ConnectionPool.statusMap().get('tor')).toBe('down');
    expect(seen).toEqual([['tor', 'down']]);
    // The verified-proxy cache must be dropped too, or a re-bind would skip re-verification.
    expect(h.invalidateTunnelVerification).toHaveBeenCalledWith('tor');
  });

  it('BLACKHOLES the partition the moment the connection drops', async () => {
    // A dead SOCKS port fails closed only while it stays dead. Loopback ports get recycled, and an
    // unrelated local process that later bound this one would inherit a partition pointing at it — a
    // stranger in the middle of traffic the user believes is tunneled.
    h.probe.mockResolvedValue(false);
    await ConnectionPool.pollOnce();
    expect(h.blackholeTunnelSession).toHaveBeenCalledWith('tor');
  });

  it('leaves a healthy connection alone', async () => {
    await ConnectionPool.pollOnce();
    expect(ConnectionPool.statusMap().get('tor')).toBe('up');
    expect(h.blackholeTunnelSession).not.toHaveBeenCalled();
  });

  it('does not probe connections nobody brought up', async () => {
    await ConnectionPool.takeDown('tor');
    h.probe.mockClear();
    await ConnectionPool.pollOnce();
    expect(h.probe).not.toHaveBeenCalled();
  });

  it('records health over time — connectedSince on up, a drop counter, and a probe heartbeat', async () => {
    // Brought up in beforeEach: connectedSince is set, nothing has dropped, no probe yet.
    let view = ConnectionPool.get('tor')!;
    expect(typeof view.connectedSince).toBe('number');
    expect(view.drops).toBe(0);
    expect(view.lastCheckedAt).toBeNull();

    // A healthy sweep stamps the heartbeat but does not touch the drop count or connectedSince.
    const connectedSince = view.connectedSince ?? 0;
    const beforePoll = Date.now();
    await ConnectionPool.pollOnce();
    view = ConnectionPool.get('tor')!;
    expect(view.lastCheckedAt).toBeGreaterThanOrEqual(beforePoll);
    expect(view.drops).toBe(0);
    expect(view.connectedSince).toBe(connectedSince);

    // It drops → drop count rises, connectedSince clears.
    h.probe.mockResolvedValue(false);
    await ConnectionPool.pollOnce();
    view = ConnectionPool.get('tor')!;
    expect(view.drops).toBe(1);
    expect(view.connectedSince).toBeNull();

    // Back up → connectedSince is fresh, the drop count stays (it is a session tally).
    h.probe.mockResolvedValue(true);
    await ConnectionPool.ensureUp('tor');
    view = ConnectionPool.get('tor')!;
    expect(view.drops).toBe(1);
    expect(view.connectedSince).toBeGreaterThanOrEqual(connectedSince);
  });

  it('does not count a first failed connect as a drop — it was never up', async () => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.resetForTests();
    ConnectionPool.init();
    h.connect.mockRejectedValue(new Error('nothing listening'));
    await expect(ConnectionPool.ensureUp('tor')).rejects.toThrow();
    const view = ConnectionPool.get('tor')!;
    expect(view.drops).toBe(0);
    expect(view.connectedSince).toBeNull();
  });
});

describe('handshake tally — session-scoped, feeds the health overview', () => {
  beforeEach(() => {
    h.prefs.networkConnections = [conn('tor')];
    ConnectionPool.resetForTests();
    ConnectionPool.init();
  });

  it('starts every counter at zero with no timestamps', () => {
    const view = ConnectionPool.get('tor')!;
    expect(view.handshakesOk).toBe(0);
    expect(view.handshakesFailed).toBe(0);
    expect(view.reconnects).toBe(0);
    expect(view.lastHandshakeAt).toBeNull();
    expect(view.lastErrorAt).toBeNull();
  });

  it('counts an ok handshake and stamps lastHandshakeAt — but not a reconnect the first time', async () => {
    const before = Date.now();
    await ConnectionPool.ensureUp('tor');
    const view = ConnectionPool.get('tor')!;
    expect(view.handshakesOk).toBe(1);
    expect(view.handshakesFailed).toBe(0);
    expect(view.reconnects).toBe(0);
    expect(view.lastHandshakeAt).toBeGreaterThanOrEqual(before);
  });

  it('counts a failed handshake and stamps lastErrorAt, leaving lastHandshakeAt untouched', async () => {
    h.connect.mockRejectedValue(new Error('wireproxy did not come up: bad key'));
    const before = Date.now();
    await expect(ConnectionPool.ensureUp('tor')).rejects.toThrow();
    const view = ConnectionPool.get('tor')!;
    expect(view.handshakesFailed).toBe(1);
    expect(view.handshakesOk).toBe(0);
    expect(view.lastErrorAt).toBeGreaterThanOrEqual(before);
    expect(view.lastHandshakeAt).toBeNull();
  });

  it('counts the SECOND (and later) successful handshake as a reconnect', async () => {
    await ConnectionPool.ensureUp('tor');
    // It drops, then comes back — that return is the reconnect.
    h.probe.mockResolvedValue(false);
    await ConnectionPool.pollOnce();
    h.probe.mockResolvedValue(true);
    await ConnectionPool.ensureUp('tor');

    const view = ConnectionPool.get('tor')!;
    expect(view.handshakesOk).toBe(2);
    expect(view.reconnects).toBe(1);
    expect(view.lastHandshakeAt).not.toBeNull();
  });

  it('keeps lastHandshakeAt across a drop — the health view still shows when it last connected', async () => {
    await ConnectionPool.ensureUp('tor');
    const at = ConnectionPool.get('tor')!.lastHandshakeAt;
    h.probe.mockResolvedValue(false);
    await ConnectionPool.pollOnce();
    const view = ConnectionPool.get('tor')!;
    expect(view.status).toBe('down');
    expect(view.connectedSince).toBeNull();
    expect(view.lastHandshakeAt).toBe(at); // retained, unlike connectedSince
  });
});
