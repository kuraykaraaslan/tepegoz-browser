import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-downloads.ts`. What it decides: `downloads:command` resolves the SENDER window's active tab for
 * the `wc` (only `retry` uses it, but it must be the right window's page), validates `{id, action}`
 * before touching the service, and refuses an untrusted sender.
 *
 * The three bulk/folder channels are here for one reason each. `clear-finished` exists so the settings
 * page stops issuing one command per record for an operation main already had, and it must report the
 * COUNT. `pick-directory` must return `''` on cancel rather than a stale path. `open-folder` must
 * report `false` — not throw, not silently succeed — when the folder is gone, because a button that
 * did nothing has to look like one.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn<(path: string) => Promise<string>>(() => Promise.resolve('')),
}));
const dialogMock = vi.hoisted((): { result: { canceled: boolean; filePaths: string[] } } => ({
  result: { canceled: false, filePaths: ['C:/picked'] },
}));
const bw = vi.hoisted(() => ({ fromWebContents: vi.fn((): unknown => ({ id: 'win' })) }));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => {
      h.handlers.set(c, fn);
    },
    removeHandler: () => undefined,
  },
  BrowserWindow: bw,
  dialog: { showOpenDialog: () => Promise.resolve(dialogMock.result) },
  shell: { openPath: (p: string) => shellMock.openPath(p) },
}));

const prefs = vi.hoisted(() => ({ downloadDirectory: 'C:/Downloads' }));
vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ downloadDirectory: prefs.downloadDirectory }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: { forbidden: 'forbidden' } }) }));

const svc = vi.hoisted(() => ({
  list: vi.fn(() => ['rec']),
  command: vi.fn<(id: string, action: string, wc: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  clearTerminal: vi.fn(() => 7),
}));
vi.mock('../downloads/download-service.electron', () => ({
  default: {
    list: () => svc.list(),
    command: (id: string, action: string, wc: unknown) => svc.command(id, action, wc),
    clearTerminal: () => svc.clearTerminal(),
  },
}));

const activeWc = { id: 'wc' };
vi.mock('../tabs', () => ({
  default: { forSender: () => ({ activeWebContents: () => activeWc }) },
}));

const { registerDownloadsIpc } = await import('./ipc-downloads');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil/' }, sender: {} };

beforeEach(() => {
  h.handlers.clear();
  svc.list.mockClear();
  svc.command.mockClear();
  svc.clearTerminal.mockClear();
  shellMock.openPath.mockClear();
  shellMock.openPath.mockResolvedValue('');
  bw.fromWebContents.mockReturnValue({ id: 'win' });
  dialogMock.result = { canceled: false, filePaths: ['C:/picked'] };
  prefs.downloadDirectory = 'C:/Downloads';
  registerDownloadsIpc();
});

describe('registerDownloadsIpc', () => {
  it('registers the list + command + bulk/folder channels', () => {
    expect([...h.handlers.keys()].sort()).toEqual(
      [
        IpcChannels.downloadsList,
        IpcChannels.downloadsCommand,
        IpcChannels.downloadsClearFinished,
        IpcChannels.downloadsPickDirectory,
        IpcChannels.downloadsOpenFolder,
      ].sort(),
    );
  });

  it('clears every finished transfer in ONE service call and reports the count', () => {
    expect(h.handlers.get(IpcChannels.downloadsClearFinished)?.(ev, undefined)).toBe(7);
    expect(svc.clearTerminal).toHaveBeenCalledTimes(1);
    // The point of the channel: no per-record command traffic for a bulk operation.
    expect(svc.command).not.toHaveBeenCalled();
  });

  it('returns an empty path when the directory picker is cancelled', async () => {
    dialogMock.result = { canceled: true, filePaths: ['C:/picked'] };
    await expect(h.handlers.get(IpcChannels.downloadsPickDirectory)?.(ev, undefined)).resolves.toEqual(
      { path: '', cancelled: true },
    );
  });

  it('returns the chosen directory when the picker is confirmed', async () => {
    await expect(h.handlers.get(IpcChannels.downloadsPickDirectory)?.(ev, undefined)).resolves.toEqual(
      { path: 'C:/picked', cancelled: false },
    );
  });

  it('opens a window-less picker when the sender has no owning BrowserWindow', async () => {
    bw.fromWebContents.mockReturnValue(null);
    await expect(
      h.handlers.get(IpcChannels.downloadsPickDirectory)?.(ev, undefined),
    ).resolves.toEqual({ path: 'C:/picked', cancelled: false });
  });

  it('reports false when the download folder cannot be opened', async () => {
    shellMock.openPath.mockResolvedValue('no such directory');
    await expect(h.handlers.get(IpcChannels.downloadsOpenFolder)?.(ev, undefined)).resolves.toBe(
      false,
    );
  });

  it('reports false — and opens nothing — when no download folder is set', async () => {
    prefs.downloadDirectory = '';
    await expect(h.handlers.get(IpcChannels.downloadsOpenFolder)?.(ev, undefined)).resolves.toBe(
      false,
    );
    expect(shellMock.openPath).not.toHaveBeenCalled();
  });

  it('opens the configured download folder', async () => {
    await expect(h.handlers.get(IpcChannels.downloadsOpenFolder)?.(ev, undefined)).resolves.toBe(
      true,
    );
    expect(shellMock.openPath).toHaveBeenCalledWith('C:/Downloads');
  });

  it('downloads:list returns the service list', () => {
    expect(h.handlers.get(IpcChannels.downloadsList)?.(ev, undefined)).toEqual(['rec']);
  });

  it('downloads:command validates then calls the service with the sender window active tab', async () => {
    await h.handlers.get(IpcChannels.downloadsCommand)?.(ev, { id: 'd1', action: 'retry' });
    expect(svc.command).toHaveBeenCalledWith('d1', 'retry', activeWc);
  });

  it('downloads:command rejects a malformed payload before touching the service', async () => {
    await expect(
      h.handlers.get(IpcChannels.downloadsCommand)?.(ev, { id: 'd1', action: 'explode' }),
    ).rejects.toBeTruthy();
    expect(svc.command).not.toHaveBeenCalled();
  });

  it('refuses an untrusted sender', async () => {
    expect(() => h.handlers.get(IpcChannels.downloadsList)?.(evil, undefined)).toThrow();
    await expect(
      h.handlers.get(IpcChannels.downloadsCommand)?.(evil, { id: 'd1', action: 'retry' }),
    ).rejects.toBeTruthy();
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.command).not.toHaveBeenCalled();
  });
});
