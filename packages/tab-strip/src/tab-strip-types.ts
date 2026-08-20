/**
 * Public data + callback contracts for `@tepegoz/tab-strip`. Extracted from `tab-strip.tsx` so the
 * component file stays small; every symbol here is re-exported from `./tab-strip` (its original home),
 * so external imports and the package barrel are unchanged.
 */

/** The minimal tab shape the strip renders. Hosts pass their own richer tab objects (structural). */
export interface TabDescriptor {
  id: string;
  title: string;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
  isLoading: boolean;
  /** Pinned tabs render favicon-only at the front and have no close button (ADR-0020). */
  pinned?: boolean;
  /** Owning group id, or null/undefined when ungrouped. */
  groupId?: string | null;
  /** Network route (Phase 5). Absent for an ordinary Direct tab, which draws nothing: a badge on every
   *  tab would be noise, and "no badge" already reads as "not tunneled". */
  network?: TabNetworkBadge;
}

/** What the strip needs to draw a tab's route: a name to show and whether traffic is currently held. */
export interface TabNetworkBadge {
  /** The connection's display label. */
  label: string;
  /** True when the route came from the group or the General default rather than from this tab. */
  inherited: boolean;
  /** True when the kill-switch is holding this tab's traffic (its connection is not up). */
  blocked: boolean;
}

/** A tab group the strip renders as a colored container wrapping its contiguous member run. */
export interface TabGroupDescriptor {
  id: string;
  name: string;
  /** One of the fixed palette keys (see GROUP_COLORS); unknown values fall back to grey. */
  color: string;
  collapsed: boolean;
  /** Network route (Phase 5) — absent for a Direct group, which draws no badge. */
  network?: GroupRouteBadge;
}

/** Health of one leg of a route. Mirrors the pool's status vocabulary. */
export type RouteLegStatus = 'up' | 'connecting' | 'down';

/**
 * What the group header needs to draw its shield: the health of each leg of the route.
 *
 * Two legs exist only for a chained route (Tor through a VPN) — which is what "this group is on the VPN
 * AND on Tor" means, since a group resolves to exactly one route. Either leg dying cuts the group, so
 * both are shown.
 */
export interface GroupRouteBadge {
  /** VPN leg, or null when the route has none (plain Tor). */
  vpn: RouteLegStatus | null;
  /** Tor leg, or null when the route has none (plain VPN). */
  tor: RouteLegStatus | null;
  /** Route name for the accessible name / tooltip ("FRA", "Tor → FRA"). */
  label: string;
}

/** A tab or group being torn out of the strip (structural — matches the host's IPC drag item). */
export interface TabTearItem {
  kind: 'tab' | 'group';
  id: string;
}

/** Payload emitted when a tab/group is torn out of the strip. Structural match for the desktop IPC. */
export interface TabTearBegin {
  item: TabTearItem;
  title: string;
  faviconUrl: string | null;
  grabOffset: { x: number; y: number };
  width: number;
  height: number;
  active: boolean;
  pinned: boolean;
  groupColor: string | null;
}

/** Cursor position in desktop-global screen coords (DIP), streamed during a torn drag. */
export interface TabTearPoint {
  screenX: number;
  screenY: number;
}

/** This strip's geometry (client/page coords) so the host can hit-test cross-window drops. */
export interface TabStripGeometryReport {
  strip: { x: number; y: number; width: number; height: number };
  slots: { id: string; left: number; width: number }[];
}

/** Localized strings, supplied by the host so the package stays i18n-agnostic. */
export interface TabStripLabels {
  /** aria-label for the whole tablist. */
  tablist: string;
  /** Shown for a tab that has no title yet. */
  untitled: string;
  /** aria-label for a tab's close button. */
  closeTab: string;
  /** aria-label for the new-tab button. */
  newTab: string;
  /** Fallback name for an unnamed group. */
  unnamedGroup?: string;
  /** aria-label for the group collapse/expand toggle. */
  toggleGroup?: string;
  /** Route badge accessible names (Phase 5). `{name}` is replaced with the connection label. */
  routeTunneled?: string;
  routeTunneledInherited?: string;
  routeBlocked?: string;
  /** Words for the group shield's legs — colour is never the only signal it carries. */
  routeLegVpn?: string;
  routeLegTor?: string;
  routeLegUp?: string;
  routeLegConnecting?: string;
  routeLegDown?: string;
}

export interface TabStripProps {
  tabs: readonly TabDescriptor[];
  /** Groups whose member tabs appear (in strip order); omit when the host has no grouping. */
  groups?: readonly TabGroupDescriptor[] | undefined;
  activeId: string | null;
  labels: TabStripLabels;
  /** A group whose inline name editor should open (e.g. from the native "Rename" menu item). */
  renamingGroupId?: string | null | undefined;
  onSelect: (id: string) => void;
  /** Close a tab (close button + middle-click). */
  onClose: (id: string) => void;
  /** Open the native tab context menu (right-click a tab). */
  onContextMenu: (id: string) => void;
  /** Open the native group context menu (right-click a group header). */
  onGroupContextMenu?: ((groupId: string) => void) | undefined;
  onNew: () => void;
  /** Drag-reorder a tab to `toIndex` (group membership is inferred by the host from neighbors). */
  onMove?: ((id: string, toIndex: number) => void) | undefined;
  /** Drag-reorder a whole group's run to `toIndex` among the non-member tabs. */
  onMoveGroup?: ((groupId: string, toIndex: number) => void) | undefined;
  /** Add a tab to a group (drag a tab onto the group's header). */
  onAssignToGroup?: ((tabId: string, groupId: string) => void) | undefined;
  /** Collapse/expand a group. */
  onToggleGroupCollapsed?: ((groupId: string, collapsed: boolean) => void) | undefined;
  /** Rename a group (inline edit committed on Enter/blur). */
  onRenameGroup?: ((groupId: string, name: string) => void) | undefined;
  /** Called once the external rename trigger (`renamingGroupId`) has been consumed. */
  onRenameHandled?: (() => void) | undefined;
  // ── Tab tear-off (drag a tab/group out of the strip into a new/another window) ──────────────────
  /** A drag left the strip (torn out): the host shows a floating preview chip seeded by title/favicon.
   *  `grabOffset` is where within the tab the pointer grabbed, so the chip stays held under the cursor. */
  onTearBegin?: ((payload: TabTearBegin) => void) | undefined;
  /** Cursor moved during a torn drag (screen coords) — reposition the floating preview. */
  onTearMove?: ((point: TabTearPoint) => void) | undefined;
  /** Torn drag released (screen coords) — the host performs the merge / new-window move. */
  onTearEnd?: ((point: TabTearPoint) => void) | undefined;
  /** Torn drag cancelled (Esc / invalid drop). */
  onTearCancel?: (() => void) | undefined;
  /** Report this strip's geometry (client coords) so the host can hit-test cross-window drops. */
  onReportGeometry?: ((geometry: TabStripGeometryReport) => void) | undefined;
}
