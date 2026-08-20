import type {
  LiveConnectionStatus,
  NetworkConnection,
  NetworkGeneralBinding,
} from '@tepegoz/shared-types';

/**
 * The network-privacy (Phase 5) bridge surface: which connections exist, where each tab is routed, and
 * the four commands that change that.
 *
 * What is deliberately NOT here: ports, provider handles, sessions. The renderer is untrusted and hosts
 * pages' chrome; a bridge method that handed it a tunnel handle would be one a page could work towards.
 * It gets labels, a health light, and id-addressed commands executed in main — the same shape the
 * downloads bridge uses for the same reason.
 */

/** One connection as the chrome sees it — no port, no handle. */
export interface NetworkConnectionView {
  id: string;
  label: string;
  /** The user's own note about where it exits ("Tor", "Mullvad SE"). Their claim, never verified. */
  note: string;
  kind: NetworkConnection['kind'];
  status: LiveConnectionStatus;
}

/** Where one tab's traffic actually goes, and which scope decided it (for the inherited/overridden mark). */
export interface TabNetworkRoute {
  connectionId: string | null;
  source: 'tab' | 'group' | 'general';
  /** False when the tab's connection is not up — the kill-switch is holding its traffic. */
  egressAllowed: boolean;
}

export interface NetworkState {
  connections: NetworkConnectionView[];
  general: NetworkGeneralBinding;
  /** Per tab id. Only tabs of the window this state was sent to. */
  tabs: Record<string, TabNetworkRoute>;
  /** Per group id: the connection it binds to, or null for an explicit Direct; absent = inherits. */
  groups: Record<string, string | null>;
}

/** What a scope can be set to over the bridge. `inherit` is invalid for General — it is the floor. */
export type ScopeBindingInput =
  | { kind: 'inherit' }
  | { kind: 'direct' }
  | { kind: 'connection'; connectionId: string };

/** Adding a connection: the user-supplied half. `id` is derived in main from the label. */
export interface NetworkConnectionInput {
  label: string;
  note: string;
  socksPort: number;
}

export interface NetworkApi {
  getNetworkState(): Promise<NetworkState>;
  onNetworkState(callback: (state: NetworkState) => void): () => void;
  bindTabNetwork(tabId: string, binding: ScopeBindingInput): Promise<void>;
  bindGroupNetwork(groupId: string, binding: ScopeBindingInput): Promise<void>;
  setGeneralNetworkBinding(binding: NetworkGeneralBinding): Promise<void>;
  addNetworkConnection(input: NetworkConnectionInput): Promise<void>;
  removeNetworkConnection(id: string): Promise<void>;
}
