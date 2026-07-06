/**
 * Tab + tab-group wire types (split out of `contract.ts` per ADR-0010's 250-line file cap). No
 * external type deps beyond built-ins; re-exported from `contract.ts` for the single public surface.
 */

/** One of the fixed Chrome-style tab-group colors (ADR-0020). */
export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

/**
 * A per-tab-group setting key. Namespaced `"<feature>.<name>"` — known first-party keys today:
 * `"agent.panelOpen"`; reserved for later: `"vpn.connectionId"`, `"tor.enabled"`. An extension should
 * use its own `"ext.<extensionId>.<name>"` key. Plain `string` (not a closed union) so any feature or
 * extension can write its own key with no change to this shared type — see `TabGroupInfo.settings` for
 * the standard this supports.
 */
export type TabGroupSettingKey = string;

/** JSON-safe, flat setting value. A feature needing more than one value uses multiple namespaced keys
 *  (e.g. `vpn.connectionId` + `vpn.mode`) rather than nesting. */
export type TabGroupSettingValue = string | number | boolean | null;

/**
 * A tab group: organizational metadata (ADR-0020) plus an extensible per-group settings bag. `settings`
 * is the standard seam for feature toggles/bindings that vary by tab group (agent enabled/open today;
 * VPN/Tor connection bindings later, per phase-5) — it carries no isolation/session/capability
 * semantics (ADR-0020 still holds for that axis), only user-facing preferences.
 */
export interface TabGroupInfo {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
  settings: Record<TabGroupSettingKey, TabGroupSettingValue>;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
  /** Pinned tabs form a run at the front of the strip and cannot belong to a group (ADR-0020). */
  pinned: boolean;
  /** Owning group id, or null when ungrouped. Mutually exclusive with `pinned`. */
  groupId: string | null;
  /** True while the page is producing audio. */
  audible?: boolean;
  /** True when the user has muted this tab's audio. */
  muted?: boolean;
  /** True when the tab's view has been discarded (sleeping) and will reload on next activation. */
  discarded?: boolean;
}

export interface TabsState {
  tabs: TabInfo[];
  /** Groups in strip order (each group's member tabs are contiguous in `tabs`). */
  groups: TabGroupInfo[];
  activeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
}
