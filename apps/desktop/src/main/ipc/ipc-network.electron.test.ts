import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-network` — the network-privacy bridge. Pinned: `networkGetState` projects the per-window routing
 * picture (empty when the sender has no window); bind / general handlers delegate to `BindingService`
 * then rebroadcast; `networkAddConnection` mints a fresh id, reads + re-parses a WireGuard config into
 * the pool (or 404s an unknown Tor upstream), and falls back to a counter id for a label with no usable
 * characters; `networkPickWireguard` refuses when the keychain is unavailable; `networkSetActive` /
 * `networkSetBinaryPath` / `networkPickBinaryFolder` (404 when nothing is found) update state; and
 * `networkRemoveConnection` releases bindings before removing the connection.
 */

const IpcChannels = {
  networkGetState: 'network:get-state',
  networkBindTab: 'network:bind-tab',
  networkBindGroup: 'network:bind-group',
  networkSetGeneral: 'network:set-general',
  networkAddConnection: 'network:add-connection',
  networkPickWireguard: 'network:pick-wireguard',
  networkSetActive: 'network:set-active',
  networkSetBinaryPath: 'network:set-binary-path',
  networkPickBinaryFolder: 'network:pick-binary-folder',
  networkRemoveConnection: 'network:remove-connection',
  networkState: 'network:state',
};
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels }));

const schemas = vi.hoisted(() => ({
  AddNetworkConnectionSchema: { parse: vi.fn() },
  BindGroupNetworkSchema: { parse: vi.fn() },
  BindTabNetworkSchema: { parse: vi.fn() },
  RemoveNetworkConnectionSchema: { parse: vi.fn() },
  SetBinaryPathSchema: { parse: vi.fn() },
  VpnBinarySchema: { parse: vi.fn() },
  SetConnectionActiveSchema: { parse: vi.fn() },
  SetGeneralBindingSchema: { parse: vi.fn() },
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => schemas);
vi.mock('@tepegoz/shared-types', () => ({ isValidConnectionId: (s: string) => s.length > 0 }));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ browser: { wireguardPickerTitle: 'Pick a profile' } }),
}));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ networkBinaries: { wireproxy: '', tor: '' } })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const bins = vi.hoisted(() => ({
  binDir: () => '/drop-in',
  findBinaryInFolder: vi.fn((): string | null => null),
  locateBinary: vi.fn((): string => {
    throw new Error('not found');
  }),
}));
vi.mock('../network/vpn-binaries.electron', () => bins);

const secrets = vi.hoisted(() => ({ isAvailable: vi.fn(() => true), save: vi.fn() }));
vi.mock('../network/vpn-secrets.electron', () => ({ default: secrets }));
vi.mock('../network/wireguard-config', () => ({
  parseWireGuardConfig: (t: string) => ({ raw: t }),
  summarize: () => ({ endpoint: 'vpn.example:51820', dns: ['1.1.1.1'], fullTunnel: true }),
}));

const tabs = vi.hoisted(() => ({
  forWindow: vi.fn((): unknown => ({ getState: () => ({ tabs: [], groups: [] }) })),
}));
vi.mock('../tabs', () => ({ default: tabs }));

const binding = vi.hoisted(() => ({
  prune: vi.fn(),
  resolveFor: vi.fn(() => ({ resolved: { connectionId: null }, source: 'default' })),
  resolveForGroup: vi.fn(() => ({ resolved: { connectionId: null } })),
  mayEgress: vi.fn(() => true),
  general: vi.fn(() => ({ mode: 'direct' })),
  bindTab: vi.fn(() => Promise.resolve()),
  bindGroup: vi.fn(() => Promise.resolve()),
  setGeneral: vi.fn(() => Promise.resolve()),
  releaseConnection: vi.fn(() => Promise.resolve()),
}));
vi.mock('../network/binding-service.electron', () => ({ default: binding }));

const pool = vi.hoisted(() => ({
  has: vi.fn<(id: string) => boolean>(() => false),
  get: vi.fn((): unknown => undefined),
  list: vi.fn(() => [] as unknown[]),
  add: vi.fn(),
  ensureUp: vi.fn(() => Promise.resolve()),
  takeDown: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
}));
vi.mock('../network/connection-pool.electron', () => ({ default: pool }));

const readFileSync = vi.hoisted(() => vi.fn(() => '[Interface]\nPrivateKey=x'));
vi.mock('node:fs', () => ({ readFileSync }));

const bw = vi.hoisted(() => ({
  fromWebContents: vi.fn((): unknown => null),
  getAllWindows: vi.fn(() => [] as unknown[]),
}));
const dialog = vi.hoisted(() => ({
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] as string[] })),
}));
vi.mock('electron', () => ({ BrowserWindow: bw, dialog }));

const handlers = vi.hoisted(() => new Map<string, (e: unknown, p: unknown) => Promise<unknown>>());
vi.mock('./ipc-helpers', () => ({
  handleAsync: (ch: string, fn: (e: unknown, p: unknown) => Promise<unknown>) => {
    handlers.set(ch, fn);
  },
}));

const mod = await import('./ipc-network');

const event = { sender: {} };
const call = (ch: string, payload?: unknown): Promise<unknown> => handlers.get(ch)!(event, payload);

beforeEach(() => {
  vi.clearAllMocks();
  bw.fromWebContents.mockReturnValue(null);
  bw.getAllWindows.mockReturnValue([]);
  secrets.isAvailable.mockReturnValue(true);
  pool.has.mockReturnValue(false);
  pool.list.mockReturnValue([]);
  tabs.forWindow.mockReturnValue({ getState: () => ({ tabs: [], groups: [] }) });
  prefs.getAll.mockReturnValue({ networkBinaries: { wireproxy: '', tor: '' } });
  dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  bins.locateBinary.mockImplementation(() => {
    throw new Error('not found');
  });
  bins.findBinaryInFolder.mockReturnValue(null);
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

describe('bind + general handlers', () => {
  it('networkBindTab delegates and rebroadcasts', async () => {
    schemas.BindTabNetworkSchema.parse.mockReturnValue({ tabId: 't9', binding: { mode: 'vpn' } });
    await call(IpcChannels.networkBindTab, {});
    expect(binding.bindTab).toHaveBeenCalledWith('t9', { mode: 'vpn' });
    expect(bw.getAllWindows).toHaveBeenCalled();
  });

  it('networkSetGeneral delegates to BindingService.setGeneral', async () => {
    schemas.SetGeneralBindingSchema.parse.mockReturnValue({ mode: 'tor' });
    await call(IpcChannels.networkSetGeneral, {});
    expect(binding.setGeneral).toHaveBeenCalledWith({ mode: 'tor' });
  });
});

describe('networkAddConnection', () => {
  it('reads + re-parses a WireGuard config into the pool', async () => {
    schemas.AddNetworkConnectionSchema.parse.mockReturnValue({
      kind: 'wireguard',
      label: 'Work VPN',
      note: 'n',
      sourcePath: '/tmp/wg.conf',
    });
    await call(IpcChannels.networkAddConnection, {});
    expect(readFileSync).toHaveBeenCalledWith('/tmp/wg.conf', 'utf8');
    expect(secrets.save).toHaveBeenCalledWith('work-vpn', '[Interface]\nPrivateKey=x');
    expect(pool.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'work-vpn', kind: 'wireguard', endpoint: 'vpn.example:51820' }),
    );
  });

  it('404s a Tor connection whose upstream is unknown', async () => {
    schemas.AddNetworkConnectionSchema.parse.mockReturnValue({
      kind: 'tor',
      label: 'Onion',
      note: '',
      upstreamConnectionId: 'ghost',
    });
    pool.has.mockReturnValue(false);
    await expect(call(IpcChannels.networkAddConnection, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'networkNoSuchConnection',
    });
  });

  it('falls back to a counter id for a label with no usable characters', async () => {
    schemas.AddNetworkConnectionSchema.parse.mockReturnValue({
      kind: 'byo-socks',
      label: '🧅🧅🧅',
      note: '',
      socksPort: 9050,
    });
    pool.has.mockImplementation((id: string) => id === 'connection');
    await call(IpcChannels.networkAddConnection, {});
    expect(pool.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'connection-2', kind: 'byo-socks', socksPort: 9050 }),
    );
  });
});

describe('networkPickWireguard', () => {
  it('refuses before opening the picker when the keychain is unavailable', async () => {
    secrets.isAvailable.mockReturnValue(false);
    await expect(call(IpcChannels.networkPickWireguard)).rejects.toMatchObject({
      statusCode: 503,
      code: 'networkSecretsUnavailable',
    });
  });

  it('returns the parsed profile summary for a picked file', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/me/home.conf'] });
    const res = (await call(IpcChannels.networkPickWireguard)) as { fileName: string };
    expect(res).toMatchObject({
      path: '/home/me/home.conf',
      fileName: 'home.conf',
      endpoint: 'vpn.example:51820',
      fullTunnel: true,
    });
  });

  it('returns null when the picker is canceled', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await call(IpcChannels.networkPickWireguard)).toBeNull();
  });
});

describe('the remaining setters', () => {
  it('networkSetActive brings a connection up or down', async () => {
    schemas.SetConnectionActiveSchema.parse.mockReturnValue({ id: 'c1', active: true });
    await call(IpcChannels.networkSetActive, {});
    expect(pool.ensureUp).toHaveBeenCalledWith('c1');

    schemas.SetConnectionActiveSchema.parse.mockReturnValue({ id: 'c1', active: false });
    await call(IpcChannels.networkSetActive, {});
    expect(pool.takeDown).toHaveBeenCalledWith('c1');
  });

  it('networkSetBinaryPath merges the path into the preference', async () => {
    schemas.SetBinaryPathSchema.parse.mockReturnValue({ binary: 'tor', path: '/opt/tor' });
    await call(IpcChannels.networkSetBinaryPath, {});
    expect(prefs.update).toHaveBeenCalledWith({
      networkBinaries: { wireproxy: '', tor: '/opt/tor' },
    });
  });

  it('networkPickBinaryFolder 404s when the binary is not under the picked folder', async () => {
    schemas.VpnBinarySchema.parse.mockReturnValue('tor');
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/apps'] });
    bins.findBinaryInFolder.mockReturnValue(null);
    await expect(call(IpcChannels.networkPickBinaryFolder, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'networkBinaryNotFound',
    });
  });

  it('networkPickBinaryFolder stores and returns a located binary', async () => {
    schemas.VpnBinarySchema.parse.mockReturnValue('tor');
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/apps'] });
    bins.findBinaryInFolder.mockReturnValue('/apps/tor/tor');
    const res = await call(IpcChannels.networkPickBinaryFolder, {});
    expect(res).toBe('/apps/tor/tor');
    expect(prefs.update).toHaveBeenCalledWith({
      networkBinaries: { wireproxy: '', tor: '/apps/tor/tor' },
    });
  });

  it('networkRemoveConnection releases bindings before removing the connection', async () => {
    schemas.RemoveNetworkConnectionSchema.parse.mockReturnValue('c-gone');
    await call(IpcChannels.networkRemoveConnection, {});
    expect(binding.releaseConnection).toHaveBeenCalledWith('c-gone');
    expect(pool.remove).toHaveBeenCalledWith('c-gone');
    expect(binding.releaseConnection.mock.invocationCallOrder[0]).toBeLessThan(
      pool.remove.mock.invocationCallOrder[0]!,
    );
  });
});

describe('broadcastNetworkState', () => {
  it('pushes the state to every live window and survives a send that throws', () => {
    const good = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const bad = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(() => {
          throw new Error('gone');
        }),
      },
    };
    bw.getAllWindows.mockReturnValue([bad, good]);
    expect(() => {
      mod.broadcastNetworkState();
    }).not.toThrow();
    expect(good.webContents.send).toHaveBeenCalledWith('network:state', expect.anything());
  });
});
