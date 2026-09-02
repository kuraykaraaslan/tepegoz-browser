import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The Phase 5 network-privacy slice of the preload bridge. The renderer names scopes + connections by
 * id and never sees a port / provider handle / session — so what's pinned is the exact channel and the
 * payload SHAPE each method wraps its args in, plus the `onNetworkState` subscribe/forward/unsubscribe.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { networkApi } = await import('./api-network');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
});

describe('scope bindings wrap their ids into a named payload', () => {
  it('bindTabNetwork → { tabId, binding }', () => {
    const binding = { kind: 'connection', connectionId: 'c1' } as never;
    void networkApi.bindTabNetwork('t1', binding);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkBindTab, { tabId: 't1', binding });
  });

  it('bindGroupNetwork → { groupId, binding }', () => {
    const binding = { kind: 'direct' } as never;
    void networkApi.bindGroupNetwork('g1', binding);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkBindGroup, { groupId: 'g1', binding });
  });

  it('setGeneralNetworkBinding passes the binding through bare', () => {
    void networkApi.setGeneralNetworkBinding({ kind: 'direct' } as never);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkSetGeneral, { kind: 'direct' });
  });
});

describe('connection + binary management', () => {
  it('removeNetworkConnection sends the bare id', () => {
    void networkApi.removeNetworkConnection('c1');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkRemoveConnection, 'c1');
  });

  it('setNetworkConnectionActive → { id, active }', () => {
    void networkApi.setNetworkConnectionActive('c1', false);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkSetActive, { id: 'c1', active: false });
  });

  it('setNetworkBinaryPath → { binary, path }', () => {
    void networkApi.setNetworkBinaryPath('tor', '/opt/tor');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkSetBinaryPath, {
      binary: 'tor',
      path: '/opt/tor',
    });
  });

  it('pickBinaryFolder sends the bare binary name', () => {
    void networkApi.pickBinaryFolder('wireproxy');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.networkPickBinaryFolder, 'wireproxy');
  });
});

describe('onNetworkState', () => {
  it('wires a listener, forwards only the state, and removes it on the returned fn', () => {
    const cb = vi.fn();
    const off = networkApi.onNetworkState(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.networkState, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;
    listener({}, { connections: [] });
    expect(cb).toHaveBeenCalledWith({ connections: [] });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.networkState, listener);
  });
});
