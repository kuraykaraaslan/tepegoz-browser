import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-downloads.ts`. Two channels; what it decides is that `downloads:command` resolves the SENDER
 * window's active tab for the `wc` (only `retry` uses it, but it must be the right window's page),
 * validates `{id, action}` before touching the service, and refuses an untrusted sender.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => {
      h.handlers.set(c, fn);
    },
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: { forbidden: 'forbidden' } }) }));

const svc = vi.hoisted(() => ({
  list: vi.fn(() => ['rec']),
  command: vi.fn<(id: string, action: string, wc: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
}));
vi.mock('../downloads/download-service.electron', () => ({
  default: {
    list: () => svc.list(),
    command: (id: string, action: string, wc: unknown) => svc.command(id, action, wc),
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
  registerDownloadsIpc();
});

describe('registerDownloadsIpc', () => {
  it('registers the list + command channels', () => {
    expect([...h.handlers.keys()].sort()).toEqual(
      [IpcChannels.downloadsList, IpcChannels.downloadsCommand].sort(),
    );
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
