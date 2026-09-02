import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-network.ts` — the Phase 5 network-privacy bridge. What's pinned is `networkStateFor`'s
 * group-route logic, which is what makes "this group is on the VPN AND on Tor" showable:
 *   - a Direct group is OMITTED (no entry == no badge);
 *   - a group bound to a connection the pool never heard of is a "dead route" (vpn: 'down'), shown
 *     rather than hidden, because the kill-switch is holding those tabs;
 *   - a plain VPN connection reports vpn: <status>, tor: null;
 *   - a Tor connection reports tor: <status>, and when it is CHAINED through a VPN upstream the vpn
 *     leg carries the upstream's status and the label shows both;
 *   - a binary is `found` when locateBinary succeeds, else `found:false` with `isOverride` reflecting
 *     a manually-set path;
 *   - `broadcastNetworkState` pushes to every live window and swallows a failing send.
 */

const getAllWindows = vi.hoisted(() => vi.fn(() => [] as unknown[]));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows, fromWebContents: () => ({ id: 'w' }) },
  dialog: { showOpenDialog: vi.fn() },
}));
vi.mock('@tepegoz/libs', () => ({
  AppError: class extends Error {},
  Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: {} }) }));
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: () => true }));

const bins = vi.hoisted(() => ({
  locate: vi.fn(() => '/found/wireproxy'),
}));
vi.mock('../network/vpn-binaries.electron', () => ({
  binDir: () => '/dropin',
  findBinaryInFolder: vi.fn(),
  locateBinary: bins.locate,
}));
vi.mock('../network/vpn-secrets.electron', () => ({ default: { isAvailable: () => true } }));
vi.mock('../network/wireguard-config', () => ({
  parseWireGuardConfig: vi.fn(),
  summarize: vi.fn(),
}));

const tm = vi.hoisted(() => ({
  state: { tabs: [] as { id: string }[], groups: [] as { id: string }[] },
}));
vi.mock('../tabs', () => ({
  default: { forWindow: () => ({ getState: () => tm.state }) },
}));

const bind = vi.hoisted(() => ({
  resolveFor: vi.fn<(id: string) => { resolved: { connectionId: string | null }; source: string }>(
    () => ({ resolved: { connectionId: null }, source: 'general' }),
  ),
  mayEgress: vi.fn(() => true),
  resolveForGroup: vi.fn<() => { resolved: { connectionId: string | null } }>(() => ({
    resolved: { connectionId: null },
  })),
  general: vi.fn(() => ({ kind: 'direct' })),
  prune: vi.fn(),
}));
vi.mock('../network/binding-service.electron', () => ({ default: bind }));

const pool = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(() => []),
  has: vi.fn(() => false),
}));
vi.mock('../network/connection-pool.electron', () => ({ default: pool }));

const prefs = vi.hoisted((): { networkBinaries: Record<string, string> } => ({
  networkBinaries: { wireproxy: '', tor: '' },
}));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));

vi.mock('./ipc-helpers', () => ({ handleAsync: vi.fn() }));

const { networkStateFor, broadcastNetworkState } = await import('./ipc-network');

const win = { id: 'w1' } as never;

beforeEach(() => {
  getAllWindows.mockReturnValue([]);
  bins.locate.mockReset().mockReturnValue('/found/wireproxy');
  tm.state = { tabs: [], groups: [] };
  bind.resolveFor
    .mockReset()
    .mockReturnValue({ resolved: { connectionId: null }, source: 'general' });
  bind.mayEgress.mockReset().mockReturnValue(true);
  bind.resolveForGroup.mockReset().mockReturnValue({ resolved: { connectionId: null } });
  bind.general.mockReset().mockReturnValue({ kind: 'direct' });
  bind.prune.mockClear();
  pool.get.mockReset();
  pool.list.mockReset().mockReturnValue([]);
  prefs.networkBinaries = { wireproxy: '', tor: '' };
});

describe('networkStateFor — shape', () => {
  it('prunes stale bindings and returns the profile-wide pieces', () => {
    const state = networkStateFor(win);
    expect(bind.prune).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      connections: [],
      general: { kind: 'direct' },
      secretsAvailable: true,
    });
    expect(state.binaries.wireproxy).toMatchObject({ found: true, path: '/found/wireproxy' });
  });

  it('maps each tab to its resolved route', () => {
    tm.state = { tabs: [{ id: 't1' }], groups: [] };
    bind.resolveFor.mockReturnValue({ resolved: { connectionId: 'conn-a' }, source: 'tab' });
    bind.mayEgress.mockReturnValue(false);
    const { tabs } = networkStateFor(win);
    expect(tabs.t1).toEqual({ connectionId: 'conn-a', source: 'tab', egressAllowed: false });
  });
});

describe('networkStateFor — group routes', () => {
  const groupOf = (win_: never) => networkStateFor(win_).groups;

  it('omits a Direct group entirely', () => {
    tm.state = { tabs: [], groups: [{ id: 'g1' }] };
    bind.resolveForGroup.mockReturnValue({ resolved: { connectionId: null } });
    expect(groupOf(win)).toEqual({});
  });

  it('shows a group bound to an unknown connection as a dead route', () => {
    tm.state = { tabs: [], groups: [{ id: 'g1' }] };
    bind.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'ghost' } });
    pool.get.mockReturnValue(undefined);
    expect(groupOf(win).g1).toEqual({
      connectionId: 'ghost',
      vpn: 'down',
      tor: null,
      label: 'ghost',
    });
  });

  it('reports a plain VPN connection as vpn:<status>, tor:null', () => {
    tm.state = { tabs: [], groups: [{ id: 'g1' }] };
    bind.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'vpn-a' } });
    pool.get.mockImplementation((id: string) =>
      id === 'vpn-a'
        ? { id: 'vpn-a', kind: 'wireguard', status: 'up', label: 'Berlin' }
        : undefined,
    );
    expect(groupOf(win).g1).toEqual({
      connectionId: 'vpn-a',
      vpn: 'up',
      tor: null,
      label: 'Berlin',
    });
  });

  it('reports a lone Tor connection as tor:<status>, vpn:null', () => {
    tm.state = { tabs: [], groups: [{ id: 'g1' }] };
    bind.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'tor-a' } });
    pool.get.mockImplementation((id: string) =>
      id === 'tor-a'
        ? { id: 'tor-a', kind: 'tor', status: 'up', label: 'Tor', upstreamConnectionId: null }
        : undefined,
    );
    expect(groupOf(win).g1).toEqual({
      connectionId: 'tor-a',
      vpn: null,
      tor: 'up',
      label: 'Tor',
    });
  });

  it('reports Tor CHAINED through a VPN with both legs and a combined label', () => {
    tm.state = { tabs: [], groups: [{ id: 'g1' }] };
    bind.resolveForGroup.mockReturnValue({ resolved: { connectionId: 'tor-a' } });
    pool.get.mockImplementation((id: string) => {
      if (id === 'tor-a')
        return {
          id: 'tor-a',
          kind: 'tor',
          status: 'up',
          label: 'Tor',
          upstreamConnectionId: 'vpn-a',
        };
      if (id === 'vpn-a')
        return { id: 'vpn-a', kind: 'wireguard', status: 'reconnecting', label: 'Berlin' };
      return undefined;
    });
    expect(groupOf(win).g1).toEqual({
      connectionId: 'tor-a',
      vpn: 'reconnecting',
      tor: 'up',
      label: 'Tor → Berlin',
    });
  });
});

describe('binary status', () => {
  it('is found:false with isOverride when detection throws and a manual path is set', () => {
    bins.locate.mockImplementation(() => {
      throw new Error('not on PATH');
    });
    prefs.networkBinaries = { wireproxy: '/my/manual/wireproxy', tor: '' };
    const { binaries } = networkStateFor(win);
    expect(binaries.wireproxy).toMatchObject({ found: false, path: '', isOverride: true });
  });
});

describe('broadcastNetworkState', () => {
  it('pushes to every live window and swallows a failing send', () => {
    const good = vi.fn();
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: good } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
      {
        isDestroyed: () => false,
        webContents: {
          send: () => {
            throw new Error('renderer gone');
          },
        },
      },
    ]);
    expect(() => broadcastNetworkState()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
