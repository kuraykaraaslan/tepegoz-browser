import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-network` — the network-privacy bridge, STATE PROJECTION half. Pinned: `networkGetState` projects
 * the per-window routing picture (empty when the sender has no window); each connection view carries the
 * slow-cause verdict computed by the real classifier; and `groupRouteFor` (via the `groups` map
 * `networkGetState` returns) — a Direct group is omitted, a group bound to a connection the pool forgot
 * shows as a dead `vpn: 'down'` route, a non-Tor connection is a single VPN leg, and a Tor connection
 * splits into `{ vpn, tor }` with the upstream VPN's health and a `label → upstreamLabel` when chained.
 * The mutating handlers and the broadcast live in `ipc-network-connections` / `ipc-network-broadcast`,
 * which share `ipc-network.test-kit`.
 */

const h = await vi.hoisted(async () =>
  (await import('./ipc-network.test-kit')).createNetworkHarness(),
);
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: h.IpcChannels }));
vi.mock('@tepegoz/desktop-ipc/schemas', () => h.schemas);
vi.mock('@tepegoz/shared-types', () => ({ isValidConnectionId: (s: string) => s.length > 0 }));
vi.mock('@tepegoz/libs', () => ({
  AppError: h.AppError,
  Logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ browser: { wireguardPickerTitle: 'Pick a profile' } }),
}));
vi.mock('@tepegoz/preferences', () => ({ default: h.prefs }));
vi.mock('../network/vpn-binaries.electron', () => h.bins);
vi.mock('../network/vpn-secrets.electron', () => ({ default: h.secrets }));
vi.mock('../network/wireguard-config', () => ({
  parseWireGuardConfig: (t: string) => ({ raw: t }),
  summarize: () => ({ endpoint: 'vpn.example:51820', dns: ['1.1.1.1'], fullTunnel: true }),
}));
vi.mock('../tabs', () => ({ default: h.tabs }));
vi.mock('../network/binding-service.electron', () => ({ default: h.binding }));
vi.mock('../network/connection-pool.electron', () => ({ default: h.pool }));
vi.mock('../network/connection-test.electron', () => ({ default: h.connectionTest }));
vi.mock('../extensions/background-connection.electron', () => ({
  default: h.backgroundConnections,
}));
vi.mock('node:fs', () => ({ readFileSync: h.readFileSync }));
vi.mock('electron', () => ({ BrowserWindow: h.bw, dialog: h.dialog }));
vi.mock('../lib/app-surfaces', () => ({ appSurfaceContents: h.appSurfaceContents }));
vi.mock('./ipc-helpers', () => ({ handleAsync: h.handleAsync }));

const mod = await import('./ipc-network');

const { IpcChannels, tabs, binding, pool, bw, call } = h;

beforeEach(() => {
  h.reset();
  mod.registerNetworkIpc();
});

describe('networkGetState', () => {
  it('returns the empty state when the sender has no window', async () => {
    const state = (await call(IpcChannels.networkGetState)) as { tabs: unknown; groups: unknown };
    expect(state).toMatchObject({ tabs: {}, groups: {}, secretsAvailable: true });
  });

  it('projects the per-window routing picture when there is a window', async () => {
    bw.fromWebContents.mockReturnValue({ __win: true });
    tabs.forWindow.mockReturnValue({
      getState: () => ({ tabs: [{ id: 't1' }], groups: [] }),
    });
    const state = (await call(IpcChannels.networkGetState)) as { tabs: Record<string, unknown> };
    expect(state.tabs.t1).toMatchObject({ source: 'default', egressAllowed: true });
  });
});

describe('connectionViews — the slow-cause verdict (Phase 5: "\'Slow\' needs a cause, not a spinner")', () => {
  function poolView(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'c1',
      label: 'FRA',
      note: '',
      kind: 'wireguard',
      status: 'up',
      upstreamConnectionId: null,
      lastError: null,
      connectedSince: Date.now(),
      lastCheckedAt: Date.now(),
      drops: 0,
      lastHandshakeAt: Date.now(),
      lastErrorAt: null,
      handshakesOk: 1,
      handshakesFailed: 0,
      reconnects: 0,
      ...over,
    };
  }

  it('is computed (via the real, un-mocked classifier) from the pool view, not re-derived downstream', async () => {
    pool.list.mockReturnValue([poolView()]);
    const state = (await call(IpcChannels.networkGetState)) as {
      connections: { slowCause: string }[];
    };
    expect(state.connections[0]?.slowCause).toBe('relay_latency');
  });

  it('reports tunnel_degraded for a down connection, without needing a separate signal', async () => {
    pool.list.mockReturnValue([poolView({ status: 'down' })]);
    const state = (await call(IpcChannels.networkGetState)) as {
      connections: { slowCause: string }[];
    };
    expect(state.connections[0]?.slowCause).toBe('tunnel_degraded');
  });
});

describe('groupRouteFor (via the networkGetState groups map)', () => {
  const withGroup = (): void => {
    bw.fromWebContents.mockReturnValue({ __win: true });
    tabs.forWindow.mockReturnValue({ getState: () => ({ tabs: [], groups: [{ id: 'g1' }] }) });
  };
  type Groups = { groups: Record<string, unknown> };

  it('omits a group that resolves to no connection (Direct)', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: null } });
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups).toEqual({});
  });

  it('shows a dead route for a group bound to a connection the pool has forgotten', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'ghost' } });
    pool.get.mockReturnValue(undefined);
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups.g1).toEqual({
      connectionId: 'ghost',
      vpn: 'down',
      tor: null,
      label: 'ghost',
    });
  });

  it('reports a non-Tor connection as a single VPN leg', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'wg1' } });
    pool.get.mockReturnValue({ id: 'wg1', kind: 'wireguard', status: 'up', label: 'Work VPN' });
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups.g1).toEqual({
      connectionId: 'wg1',
      vpn: 'up',
      tor: null,
      label: 'Work VPN',
    });
  });

  it('reports a Tor connection with no upstream as a Tor-only leg', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'tor1' } });
    pool.get.mockImplementation((id: string) =>
      id === 'tor1'
        ? { id: 'tor1', kind: 'tor', status: 'up', label: 'Onion', upstreamConnectionId: null }
        : undefined,
    );
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups.g1).toEqual({
      connectionId: 'tor1',
      vpn: null,
      tor: 'up',
      label: 'Onion',
    });
  });

  it('chains a Tor connection through its upstream VPN, showing both healths side by side', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'tor1' } });
    pool.get.mockImplementation((id: string) => {
      if (id === 'tor1')
        return {
          id: 'tor1',
          kind: 'tor',
          status: 'up',
          label: 'Onion',
          upstreamConnectionId: 'wg1',
        };
      if (id === 'wg1')
        return { id: 'wg1', kind: 'wireguard', status: 'degraded', label: 'Work VPN' };
      return undefined;
    });
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups.g1).toEqual({
      connectionId: 'tor1',
      vpn: 'degraded',
      tor: 'up',
      label: 'Onion → Work VPN',
    });
  });

  it('falls back to the Tor label alone when the named upstream is itself gone from the pool', async () => {
    withGroup();
    binding.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'tor1' } });
    pool.get.mockImplementation((id: string) =>
      id === 'tor1'
        ? { id: 'tor1', kind: 'tor', status: 'up', label: 'Onion', upstreamConnectionId: 'wg-gone' }
        : undefined,
    );
    const state = (await call(IpcChannels.networkGetState)) as Groups;
    expect(state.groups.g1).toEqual({
      connectionId: 'tor1',
      vpn: null,
      tor: 'up',
      label: 'Onion',
    });
  });
});
