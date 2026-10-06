import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-network` — the network-privacy bridge, MUTATING HANDLERS half. Pinned: bind / general handlers
 * delegate to `BindingService` then rebroadcast; `networkAddConnection` mints a fresh id, reads +
 * re-parses a WireGuard config into the pool (or 404s an unknown Tor upstream), adds a Tor connection
 * with or without an upstream, and falls back to a counter id for a label with no usable characters;
 * `networkPickWireguard` refuses when the keychain is unavailable; `networkSetActive` /
 * `networkSetBinaryPath` / `networkPickBinaryFolder` (404 when nothing is found) update state;
 * `networkNewIdentity` reloads exactly the affected tabs; `networkRemoveConnection` releases bindings
 * before removing the connection; `networkTestConnection` delegates; `networkBindGroup` delegates to
 * `BindingService.bindGroup`; and both file/folder pickers parent their dialog to the sender window.
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

const {
  IpcChannels,
  schemas,
  prefs,
  bins,
  secrets,
  tabs,
  binding,
  pool,
  connectionTest,
  readFileSync,
  bw,
  dialog,
  call,
} = h;

beforeEach(() => {
  h.reset();
  mod.registerNetworkIpc();
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

  it('networkNewIdentity reloads exactly the tabs on that connection, in every window', async () => {
    // Cross-window on purpose: a reload list that stopped at the focused window would leave pages from
    // the identity that was just burned still on screen elsewhere.
    schemas.NewNetworkIdentitySchema.parse.mockReturnValue('t1');
    tabs.bindingStates.mockReturnValue([
      { tabId: 'a', groupId: null },
      { tabId: 'b', groupId: null },
      { tabId: 'c', groupId: null },
    ]);
    binding.resolveFor.mockImplementation((tabId: string) => ({
      resolved: { connectionId: tabId === 'c' ? 'other' : 't1' },
      source: 'group',
    }));

    await expect(call(IpcChannels.networkNewIdentity, 't1')).resolves.toEqual({
      reconnected: true,
    });
    expect(pool.newIdentity).toHaveBeenCalledWith('t1');
    expect(tabs.reloadTab.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('does NOT reload when the tunnel did not come back up', async () => {
    // Reloading a tab whose connection is down just paints a kill-switch error over the page the user
    // was reading, destroying the one thing they still had.
    schemas.NewNetworkIdentitySchema.parse.mockReturnValue('t1');
    tabs.bindingStates.mockReturnValue([{ tabId: 'a', groupId: null }]);
    binding.resolveFor.mockReturnValue({ resolved: { connectionId: 't1' }, source: 'group' });
    pool.newIdentity.mockResolvedValue({ reconnected: false });

    await call(IpcChannels.networkNewIdentity, 't1');
    expect(tabs.reloadTab).not.toHaveBeenCalled();
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

describe('networkTestConnection', () => {
  it('delegates to ConnectionTest.testConnection and rebroadcasts', async () => {
    schemas.TestNetworkConnectionSchema.parse.mockReturnValue('c1');
    connectionTest.testConnection.mockResolvedValue({
      connectionId: 'c1',
      configParse: { status: 'pass', detail: null },
      handshake: { status: 'fail', detail: 'wireproxy did not come up: bad key material' },
      reachability: 'notReached',
    });
    const result = await call(IpcChannels.networkTestConnection, 'c1');
    expect(connectionTest.testConnection).toHaveBeenCalledWith('c1');
    expect(result).toMatchObject({ reachability: 'notReached' });
    expect(bw.getAllWindows).toHaveBeenCalled();
  });
});

describe('networkBindGroup', () => {
  it('delegates to BindingService.bindGroup then rebroadcasts', async () => {
    schemas.BindGroupNetworkSchema.parse.mockReturnValue({
      groupId: 'g7',
      binding: { mode: 'tor' },
    });
    await call(IpcChannels.networkBindGroup, {});
    expect(binding.bindGroup).toHaveBeenCalledWith('g7', { mode: 'tor' });
    expect(bw.getAllWindows).toHaveBeenCalled();
  });
});

describe('networkAddConnection — Tor', () => {
  it('adds a Tor connection chained onto a known upstream', async () => {
    schemas.AddNetworkConnectionSchema.parse.mockReturnValue({
      kind: 'tor',
      label: 'Onion',
      note: 'n',
      upstreamConnectionId: 'wg1',
    });
    pool.has.mockImplementation((id: string) => id === 'wg1');
    await call(IpcChannels.networkAddConnection, {});
    expect(pool.add).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'onion',
        kind: 'tor',
        upstreamConnectionId: 'wg1',
        version: 1,
      }),
    );
  });

  it('adds a standalone Tor connection when there is no upstream at all', async () => {
    schemas.AddNetworkConnectionSchema.parse.mockReturnValue({
      kind: 'tor',
      label: 'Solo Onion',
      note: '',
      upstreamConnectionId: null,
    });
    await call(IpcChannels.networkAddConnection, {});
    expect(pool.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'solo-onion', kind: 'tor', upstreamConnectionId: null }),
    );
  });
});

describe('pickers parented to the sender window', () => {
  it('networkPickWireguard parents the open dialog to the sender window', async () => {
    bw.fromWebContents.mockReturnValue({ __win: true });
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/me/vpn.conf'] });
    const res = (await call(IpcChannels.networkPickWireguard)) as { fileName: string };
    expect(res).toMatchObject({ fileName: 'vpn.conf' });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      { __win: true },
      expect.objectContaining({ properties: ['openFile'] }),
    );
  });

  it('networkPickBinaryFolder parents the open dialog to the sender window', async () => {
    bw.fromWebContents.mockReturnValue({ __win: true });
    schemas.VpnBinarySchema.parse.mockReturnValue('tor');
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/apps'] });
    bins.findBinaryInFolder.mockReturnValue('/apps/tor/tor');
    const res = await call(IpcChannels.networkPickBinaryFolder, {});
    expect(res).toBe('/apps/tor/tor');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      { __win: true },
      expect.objectContaining({ properties: ['openDirectory'] }),
    );
  });
});
