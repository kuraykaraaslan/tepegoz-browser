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
  /** Which connection this one chains through, if any (Tor over VPN). */
  upstreamConnectionId: string | null;
  /** Why it is not up, in the provider's own words. Blank when it is up or has never been tried. */
  lastError: string | null;
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

/**
 * A group's route, split into its two possible legs so the header badge can show both at once.
 *
 * A route can be a VPN, Tor, or **Tor chained through a VPN** — which is what "this group is on the VPN
 * *and* on Tor" means, since a group resolves to exactly one route. Two legs, two half-shields.
 */
export interface GroupNetworkRoute {
  /** The resolved connection, or null when the group is Direct. */
  connectionId: string | null;
  /** The VPN leg's health, or null when the route has no VPN leg (plain Tor). */
  vpn: LiveConnectionStatus | null;
  /** The Tor leg's health, or null when the route has no Tor leg (plain VPN). */
  tor: LiveConnectionStatus | null;
  /** Human name for the whole route ("FRA", or "Tor via FRA") — the badge's accessible name. */
  label: string;
}

/** Whether a helper binary the userspace providers need is actually present. */
export interface BinaryStatus {
  found: boolean;
  /** The resolved path when found, or the configured override when set but missing. */
  path: string;
}

/** One file's outcome from an import. Reported per file, so one bad profile does not sink the batch. */
export interface ProfileImportResult {
  fileName: string;
  connectionId: string | null;
  /** Safe-to-show facts the parser found. Never any key material. */
  summary: { endpoint: string; dns: string[]; fullTunnel: boolean } | null;
  /** The parser's own message when the file was rejected — written to be shown to the user as-is. */
  error: string | null;
}

export interface NetworkState {
  connections: NetworkConnectionView[];
  general: NetworkGeneralBinding;
  /** Per tab id. Only tabs of the window this state was sent to. */
  tabs: Record<string, TabNetworkRoute>;
  /** Per group id — the RESOLVED route, including one inherited from the General default. Absent only
   *  when the group is Direct, so "no entry" reads the same as "no badge". */
  groups: Record<string, GroupNetworkRoute>;
  /** Helper binaries. The manager shows where to put a missing one instead of failing at connect time. */
  binaries: { wireproxy: BinaryStatus; tor: BinaryStatus };
  /** False when the OS keychain is unavailable — no WireGuard profile may be imported, because its
   *  private key could then only be stored in plain text. */
  secretsAvailable: boolean;
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
  /** Open a file picker for WireGuard `.conf` profiles and import every one the user chose. */
  importWireguardProfiles(): Promise<ProfileImportResult[]>;
  addTorConnection(input: { label: string; note: string; upstreamConnectionId: string | null }): Promise<void>;
  /** Bring one connection up or take it down on the spot. */
  setNetworkConnectionActive(id: string, active: boolean): Promise<void>;
  setNetworkBinaryPath(binary: 'wireproxy' | 'tor', path: string): Promise<void>;
}
