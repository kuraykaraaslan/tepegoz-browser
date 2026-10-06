import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-network` — `broadcastNetworkState`. Pinned: the per-window loop (each chrome window gets its OWN
 * personalized `networkStateFor(win)`, survives a throwing `send`), and that it additionally reaches
 * trusted `tepegoz://` app-page surfaces (via `appSurfaceContents`) with the profile-wide projection
 * (empty `tabs`/`groups` — there is no owning window to resolve a per-tab breakdown from), without
 * double-sending to a chrome window the first loop already reached.
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

const { backgroundConnections, bw, appSurfaceContents } = h;

beforeEach(() => {
  h.reset();
  mod.registerNetworkIpc();
});

describe('broadcastNetworkState', () => {
  it('pushes the per-window state to every live window and survives a send that throws', () => {
    const good = { isDestroyed: () => false, webContents: { id: 1, send: vi.fn() } };
    const bad = {
      isDestroyed: () => false,
      webContents: {
        id: 2,
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
    expect(backgroundConnections.notifyEgressChange).toHaveBeenCalledTimes(1);
  });

  it('also reaches trusted app-page surfaces (tepegoz:// tabs) with the profile-wide projection', () => {
    const page = { id: 9, isDestroyed: () => false, send: vi.fn() };
    bw.getAllWindows.mockReturnValue([]);
    appSurfaceContents.mockReturnValue([page]);
    mod.broadcastNetworkState();
    expect(page.send).toHaveBeenCalledWith(
      'network:state',
      expect.objectContaining({ tabs: {}, groups: {} }),
    );
  });

  it('does not double-send to a chrome window already reached by the per-window loop', () => {
    const win = { isDestroyed: () => false, webContents: { id: 5, send: vi.fn() } };
    bw.getAllWindows.mockReturnValue([win]);
    appSurfaceContents.mockReturnValue([win.webContents]);
    mod.broadcastNetworkState();
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('survives a send that throws on an app-page surface', () => {
    const page = {
      id: 9,
      isDestroyed: () => false,
      send: vi.fn(() => {
        throw new Error('gone');
      }),
    };
    bw.getAllWindows.mockReturnValue([]);
    appSurfaceContents.mockReturnValue([page]);
    expect(() => {
      mod.broadcastNetworkState();
    }).not.toThrow();
  });
});
