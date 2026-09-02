import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/** The uploads slice of the preload bridge — the renderer sees redacted records only; paths stay in main. */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { uploadsApi } = await import('./api-uploads');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
});

it('list hits its channel with no payload; commandUpload forwards the input', () => {
  void uploadsApi.listUploads();
  void uploadsApi.commandUpload({ id: 'up-1', action: 'cancel' } as never);
  expect(invoke).toHaveBeenNthCalledWith(1, IpcChannels.uploadsList);
  expect(invoke).toHaveBeenNthCalledWith(2, IpcChannels.uploadsCommand, {
    id: 'up-1',
    action: 'cancel',
  });
});

describe('onUploadsState', () => {
  it('wires, forwards only the state, and unsubscribes', () => {
    const cb = vi.fn();
    const off = uploadsApi.onUploadsState(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;
    listener({}, { items: [] });
    expect(cb).toHaveBeenCalledWith({ items: [] });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.uploadsState, listener);
  });
});
