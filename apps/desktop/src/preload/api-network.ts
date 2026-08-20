import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type NetworkConnectionInput,
  type NetworkGeneralBinding,
  type NetworkState,
  type PickedWireguardProfile,
  type ScopeBindingInput,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Network-privacy (Phase 5) bridge methods. The renderer names scopes and connections by id and never
 *  sees a port, a provider handle, or a session — every command is executed in main. */
export const networkApi: Pick<
  TepegozApi,
  | 'getNetworkState'
  | 'onNetworkState'
  | 'bindTabNetwork'
  | 'bindGroupNetwork'
  | 'setGeneralNetworkBinding'
  | 'addNetworkConnection'
  | 'removeNetworkConnection'
  | 'pickWireguardProfile'
  | 'setNetworkConnectionActive'
  | 'setNetworkBinaryPath'
> = {
  getNetworkState: () => invoke<NetworkState>(IpcChannels.networkGetState),
  onNetworkState: (callback: (state: NetworkState) => void) => {
    const listener = (_event: unknown, state: NetworkState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.networkState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.networkState, listener);
    };
  },
  bindTabNetwork: (tabId: string, binding: ScopeBindingInput) =>
    invoke<void>(IpcChannels.networkBindTab, { tabId, binding }),
  bindGroupNetwork: (groupId: string, binding: ScopeBindingInput) =>
    invoke<void>(IpcChannels.networkBindGroup, { groupId, binding }),
  setGeneralNetworkBinding: (binding: NetworkGeneralBinding) =>
    invoke<void>(IpcChannels.networkSetGeneral, binding),
  addNetworkConnection: (input: NetworkConnectionInput) =>
    invoke<void>(IpcChannels.networkAddConnection, input),
  removeNetworkConnection: (id: string) => invoke<void>(IpcChannels.networkRemoveConnection, id),
  pickWireguardProfile: () =>
    invoke<PickedWireguardProfile | null>(IpcChannels.networkPickWireguard),
  setNetworkConnectionActive: (id: string, active: boolean) =>
    invoke<void>(IpcChannels.networkSetActive, { id, active }),
  setNetworkBinaryPath: (binary: 'wireproxy' | 'tor', path: string) =>
    invoke<void>(IpcChannels.networkSetBinaryPath, { binary, path }),
};
