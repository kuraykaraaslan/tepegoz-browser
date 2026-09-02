import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The downloads slice of the preload bridge. Pure delegation to `invoke(channel, payload)`; what's
 * worth pinning is the id-addressed command shape and the `onDownloadsState` subscription — it wires
 * an `ipcRenderer` listener, forwards only the state to the callback, and its return value actually
 * removes that listener.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));

const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { downloadsApi } = await import('./api-downloads');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
});

describe('request/response methods', () => {
  it('list / clear / pick-dir / open-folder hit their channels with no payload', () => {
    void downloadsApi.listDownloads();
    void downloadsApi.clearFinishedDownloads();
    void downloadsApi.pickDownloadDirectory();
    void downloadsApi.openDownloadFolder();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      IpcChannels.downloadsList,
      IpcChannels.downloadsClearFinished,
      IpcChannels.downloadsPickDirectory,
      IpcChannels.downloadsOpenFolder,
    ]);
  });

  it('commandDownload forwards the id-addressed command input verbatim', () => {
    const input = { id: 'dl-1', action: 'pause' } as never;
    void downloadsApi.commandDownload(input);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.downloadsCommand, input);
  });
});

describe('onDownloadsState subscription', () => {
  it('wires a listener, forwards only the state, and unsubscribes on the returned fn', () => {
    const cb = vi.fn();
    const off = downloadsApi.onDownloadsState(cb);

    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.downloadsState, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;

    listener({ sender: 'ignored' }, { items: [{ id: 'dl-1' }] });
    expect(cb).toHaveBeenCalledWith({ items: [{ id: 'dl-1' }] });

    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.downloadsState, listener);
  });
});
