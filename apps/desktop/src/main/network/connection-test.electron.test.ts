import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkConnection } from '@tepegoz/shared-types';

/**
 * The manual "test this connection" flow (Phase 5 onboarding gap). What is pinned here is the STAGE
 * classification: config parse runs first and is cheap/synchronous (no network attempt); a config-parse
 * failure skips the handshake stage entirely rather than attempting it; a handshake stage is exactly
 * `ConnectionPool.ensureUp` — the SAME call the manual Connect button makes — and its outcome decides the
 * coarse `reachability` result (`unverified` on success, `notReached` on any failure).
 */

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({
  AppError,
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const h = vi.hoisted(() => ({
  networkConnections: [] as NetworkConnection[],
  has: vi.fn<(id: string) => boolean>(() => true),
  ensureUp: vi.fn<(id: string) => Promise<{ partition: string; socksPort: number | null }>>(),
  read: vi.fn<(id: string) => string | null>(() => null),
  parseWireGuardConfig: vi.fn<(text: string) => unknown>(),
}));

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ networkConnections: h.networkConnections }) },
}));
vi.mock('./connection-pool.electron', () => ({
  default: { has: h.has, ensureUp: h.ensureUp },
}));
vi.mock('./vpn-secrets.electron', () => ({ default: { read: h.read } }));
vi.mock('./wireguard-config', () => ({ parseWireGuardConfig: h.parseWireGuardConfig }));

const { default: ConnectionTest } = await import('./connection-test.electron');

const wgConn = (over: Partial<NetworkConnection> = {}): NetworkConnection =>
  ({
    id: 'c1',
    label: 'Work VPN',
    note: '',
    updatedAt: 0,
    version: 1,
    kind: 'wireguard',
    endpoint: 'vpn.example:51820',
    ...over,
  }) as NetworkConnection;

const torConn = (over: Partial<NetworkConnection> = {}): NetworkConnection =>
  ({
    id: 'c1',
    label: 'Onion',
    note: '',
    updatedAt: 0,
    version: 1,
    kind: 'tor',
    upstreamConnectionId: null,
    ...over,
  }) as NetworkConnection;

const socksConn = (over: Partial<NetworkConnection> = {}): NetworkConnection =>
  ({
    id: 'c1',
    label: 'Local Tor',
    note: '',
    updatedAt: 0,
    version: 1,
    kind: 'byo-socks',
    socksPort: 9050,
    ...over,
  }) as NetworkConnection;

beforeEach(() => {
  vi.clearAllMocks();
  h.networkConnections = [];
  h.has.mockReturnValue(true);
  h.read.mockReturnValue(null);
  h.ensureUp.mockResolvedValue({ partition: 'persist:tepegoz-web--conn-c1', socksPort: 9050 });
});

describe('unknown connection', () => {
  it('throws a 404 networkNoSuchConnection, never attempting a stage', async () => {
    await expect(ConnectionTest.testConnection('ghost')).rejects.toMatchObject({
      statusCode: 404,
      code: 'networkNoSuchConnection',
    });
    expect(h.ensureUp).not.toHaveBeenCalled();
  });
});

describe('config-parse stage — WireGuard', () => {
  it('fails, with no handshake attempted, when no secret is stored (or it could not be decrypted)', async () => {
    h.networkConnections = [wgConn()];
    h.read.mockReturnValue(null);
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({
      status: 'fail',
      detail: 'This connection has no stored WireGuard profile (or it could not be decrypted)',
    });
    expect(result.handshake).toEqual({ status: 'skipped', detail: null });
    expect(result.reachability).toBe('notReached');
    expect(h.ensureUp).not.toHaveBeenCalled();
  });

  it('fails with the parser’s own message when the stored text is not a valid config', async () => {
    h.networkConnections = [wgConn()];
    h.read.mockReturnValue('garbage');
    h.parseWireGuardConfig.mockImplementation(() => {
      throw new Error('No [Peer] section found');
    });
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({ status: 'fail', detail: 'No [Peer] section found' });
    expect(result.handshake.status).toBe('skipped');
    expect(h.ensureUp).not.toHaveBeenCalled();
  });

  it('passes and proceeds to the handshake stage when the stored config parses cleanly', async () => {
    h.networkConnections = [wgConn()];
    h.read.mockReturnValue('[Interface]\n...');
    h.parseWireGuardConfig.mockReturnValue({});
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({ status: 'pass', detail: null });
    expect(h.ensureUp).toHaveBeenCalledWith('c1');
  });
});

describe('config-parse stage — Tor', () => {
  it('fails when the chained upstream no longer exists', async () => {
    h.networkConnections = [torConn({ upstreamConnectionId: 'ghost-upstream' })];
    h.has.mockReturnValue(false);
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({
      status: 'fail',
      detail: 'No such upstream connection: ghost-upstream',
    });
    expect(result.handshake.status).toBe('skipped');
    expect(h.ensureUp).not.toHaveBeenCalled();
  });

  it('passes straight to Tor (no upstream) with no pool lookup needed', async () => {
    h.networkConnections = [torConn({ upstreamConnectionId: null })];
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({ status: 'pass', detail: null });
    expect(h.ensureUp).toHaveBeenCalledWith('c1');
  });

  it('passes when the chained upstream exists', async () => {
    h.networkConnections = [torConn({ upstreamConnectionId: 'wg1' })];
    h.has.mockReturnValue(true);
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({ status: 'pass', detail: null });
    expect(h.ensureUp).toHaveBeenCalledWith('c1');
  });
});

describe('config-parse stage — BYO-SOCKS', () => {
  it('always passes — the port range is already enforced at add time', async () => {
    h.networkConnections = [socksConn()];
    const result = await ConnectionTest.testConnection('c1');
    expect(result.configParse).toEqual({ status: 'pass', detail: null });
    expect(h.ensureUp).toHaveBeenCalledWith('c1');
  });
});

describe('handshake stage', () => {
  it('passes and reports reachability as "unverified" (not a fabricated pass) on a real connect', async () => {
    h.networkConnections = [socksConn()];
    h.ensureUp.mockResolvedValue({ partition: 'p', socksPort: 9050 });
    const result = await ConnectionTest.testConnection('c1');
    expect(result.handshake).toEqual({ status: 'pass', detail: null });
    expect(result.reachability).toBe('unverified');
  });

  it('fails with ensureUp’s own thrown message, and reachability is "notReached"', async () => {
    h.networkConnections = [socksConn()];
    h.ensureUp.mockRejectedValue(new Error('Nothing is listening on 127.0.0.1:9050'));
    const result = await ConnectionTest.testConnection('c1');
    expect(result.handshake).toEqual({
      status: 'fail',
      detail: 'Nothing is listening on 127.0.0.1:9050',
    });
    expect(result.reachability).toBe('notReached');
  });

  it('never fabricates a distinct DNS or exit-reachability stage — only the coarse "reachability" field', async () => {
    h.networkConnections = [socksConn()];
    const result = await ConnectionTest.testConnection('c1');
    expect(Object.keys(result).sort()).toEqual([
      'configParse',
      'connectionId',
      'handshake',
      'reachability',
    ]);
  });
});
