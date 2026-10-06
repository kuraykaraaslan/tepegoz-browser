/**
 * Network privacy channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsNetwork = {
  // Network privacy (Phase 5): the connection pool + the three-scope binding. State is pushed live so a
  // dropped tunnel updates every indicator without the chrome polling for it.
  networkGetState: 'network:get-state',
  networkState: 'network:state',
  networkBindTab: 'network:bind-tab',
  networkBindGroup: 'network:bind-group',
  networkSetGeneral: 'network:set-general',
  networkAddConnection: 'network:add-connection',
  networkPickWireguard: 'network:pick-wireguard',
  networkSetActive: 'network:set-active',
  networkSetBinaryPath: 'network:set-binary-path',
  networkPickBinaryFolder: 'network:pick-binary-folder',
  networkRemoveConnection: 'network:remove-connection',
  /** Tor "new identity": new circuits AND a wipe of that connection's site state, in one action. */
  networkNewIdentity: 'network:new-identity',
  /** The manual "test this connection" flow: config parse → handshake → a coarse reachability signal. */
  networkTestConnection: 'network:test-connection',
} as const;
