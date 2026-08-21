/**
 * Tab + tab-group wire types (split out of `contract.ts` per ADR-0010's 250-line file cap). No
 * external type deps beyond built-ins; re-exported from `contract.ts` for the single public surface.
 */

/** One of the fixed Chrome-style tab-group colors (ADR-0020). */
export type TabGroupColor =
  'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

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
  /**
   * True when the tab is hidden: removed from the tab strip but kept ALIVE and continuously rendering
   * (its view stays attached to the window, parked off-screen at a stable size) so the agent can keep
   * driving it by id. Absent/false ⟺ a normal strip tab. Orthogonal to `pinned`/`groupId`.
   */
  hidden?: boolean;
}

export interface TabsState {
  tabs: TabInfo[];
  /** Groups in strip order (each group's member tabs are contiguous in `tabs`). */
  groups: TabGroupInfo[];
  activeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

// ── Tab tear-off (drag a tab/group out of the strip into a new/another window) ──────────────────────

/** What is being torn off: a single tab or a whole group (its header was dragged). */
export interface TabDragItem {
  kind: 'tab' | 'group';
  /** The tab id (`kind: 'tab'`) or group id (`kind: 'group'`). */
  id: string;
}

/** Payload for `tabsDragBegin` — identifies the dragged item and everything needed to render the
 *  floating preview so it looks and is sized EXACTLY like the real tab it was torn from. */
export interface TabDragBegin {
  item: TabDragItem;
  /** Title shown on the floating preview chip (the tab's title, or the group name). */
  title: string;
  /** Favicon URL for the preview chip (single tab only), or null. */
  faviconUrl: string | null;
  /** Where within the dragged tab the pointer grabbed (client px), so the preview stays "held" under the
   *  cursor at that same point instead of jumping to a fixed offset. */
  grabOffset: { x: number; y: number };
  /** The dragged tab's measured on-screen size (client px) — the preview window is sized to match. */
  width: number;
  height: number;
  /** Whether the torn tab was the active tab (drives the chip's active vs inactive surface styling). */
  active: boolean;
  /** Whether the torn tab was pinned (favicon-only chip, no title). */
  pinned: boolean;
  /** The owning group's palette color key (e.g. `blue`), or null when ungrouped — for the chip accent. */
  groupColor: string | null;
}

/** Payload for `tabsDragMove` / `tabsDragEnd` — the cursor in desktop-global screen coords (DIP). `torn`
 *  is true while the pointer is outside the source strip (the floating preview is shown). */
export interface TabDragPoint {
  screenX: number;
  screenY: number;
  torn: boolean;
}

/** One rendered tab's horizontal extent in the strip (client CSS px), for drop-index hit-testing. */
export interface TabStripSlot {
  id: string;
  left: number;
  width: number;
}

/** Payload for `tabsReportStrip` — this window's strip rect + per-tab slots in client (renderer) coords.
 *  Main adds the window's content-origin to get screen coords for cross-window drop hit-testing. */
export interface TabStripGeometry {
  /** The strip's bounding rect in client coords (below the caption, above the content view). */
  strip: { x: number; y: number; width: number; height: number };
  /** The draggable tab slots, left-to-right. */
  slots: TabStripSlot[];
}

/** Payload for `find:start` — one find-in-page request against the sender window's ACTIVE tab.
 *  `findNext` marks the OPENING request of a find session (true), versus a follow-up step within the
 *  session already open (false) — it is not "go to the next match". Chromium answers a follow-up that
 *  has no open session with silence: no event, no error. */
export interface FindInPageQuery {
  query: string;
  forward: boolean;
  findNext: boolean;
  matchCase: boolean;
}

/** Payload for `find:result` — Chromium's `found-in-page` counts, echoed with the query they belong to
 *  so the renderer can drop a late result for a query the user has already typed past. */
export interface FindInPageResult {
  query: string;
  /** 1-based index of the highlighted match; 0 when there is none. */
  activeMatchOrdinal: number;
  matches: number;
}
