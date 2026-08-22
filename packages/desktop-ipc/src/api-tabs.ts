/**
 * Browser-tabs slice of {@link TepegozApi} — tabs, groups, drag/tear-off, and content-area layout.
 * Type-only imports keep this dependency-free for the sandboxed preload; composed into the full
 * surface by `api.ts`.
 */
import type { ContentBounds } from './contract';
import type { NavHistoryDirection } from '@tepegoz/navigation';
import type {
  FindInPageQuery,
  FindInPageResult,
  TabDragBegin,
  TabDragPoint,
  TabGroupColor,
  TabGroupSettingKey,
  TabGroupSettingValue,
  TabsState,
  TabStripGeometry,
} from './tabs-types';

export interface TabsApi {
  // Browser tabs (each is an isolated WebContentsView in the main process).
  createTab(url?: string): void;
  /** Open a URL in a background tab (does not steal focus). */
  createTabInBackground(url: string): void;
  closeTab(id: string): void;
  activateTab(id: string): void;
  /** Pop the native right-click menu for a tab (Chrome-style), acted on in the main process. */
  showTabContextMenu(id: string): void;
  /** Navigate the ACTIVE tab (omnibox). */
  navigateTab(input: string): void;
  tabGoBack(): void;
  tabGoForward(): void;
  tabReload(): void;
  /** Navigate the ACTIVE tab to the home / start page. */
  tabHome(): void;
  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). */
  reopenClosedTab(): void;
  // Advanced tab UX (ADR-0020): drag-reorder, groups, pinning. All fire-and-forget; state arrives via
  // `onTabsState`.
  /** Drag-reorder a tab to `toIndex`. `intoGroupId`: a group id joins it, null ungroups, omitted infers. */
  moveTab(id: string, toIndex: number, intoGroupId?: string | null): void;
  /** Pin or unpin a tab (pinned tabs sit at the front and leave any group). */
  setTabPinned(id: string, pinned: boolean): void;
  /** Hide or unhide a tab. A hidden tab leaves the strip but stays alive and rendering (the agent can
   *  keep driving it by id); unhide brings it back into the strip. */
  setTabHidden(id: string, hidden: boolean): void;
  /** Pop the native "Hidden tabs" menu (list of hidden tabs to unhide), anchored to the sender window. */
  showHiddenTabsMenu(): void;
  /** Pop the ACTIVE tab's back/forward history dropdown (right-click a nav button), Chrome-style.
   *  Main owns the list and the jump — the renderer only says which button was clicked. */
  showNavHistoryMenu(direction: NavHistoryDirection): void;
  /** Create a group from `memberIds` (empty/omitted → the active tab). */
  createTabGroup(memberIds?: string[]): void;
  /** Reorder a whole group's run to `toIndex` among the non-member tabs. */
  moveTabGroup(groupId: string, toIndex: number): void;
  /** Patch a group's name/color/collapsed (only provided keys change). */
  updateTabGroup(
    groupId: string,
    patch: {
      name?: string;
      color?: TabGroupColor;
      collapsed?: boolean;
      settings?: Record<TabGroupSettingKey, TabGroupSettingValue>;
    },
  ): void;
  /** Add a tab to an existing group. */
  assignTabToGroup(tabId: string, groupId: string): void;
  /** Remove a tab from its group (it becomes ungrouped). */
  removeTabFromGroup(tabId: string): void;
  /** Dissolve a group (its tabs become ungrouped). */
  ungroupTabGroup(groupId: string): void;
  /** Pop the native group context menu (right-click a group header), acted on in the main process. */
  showTabGroupContextMenu(groupId: string): void;
  /** Main→renderer: open the inline rename editor for a group (from the native "Rename" menu item). */
  onTabGroupStartRename(callback: (groupId: string) => void): () => void;
  /** Report the content-area rect so main can lay out the active web view below the chrome. */
  setContentBounds(bounds: ContentBounds): void;
  /** Hide/show the web view so a chrome overlay (e.g. Settings) can take the content area. */
  setContentVisible(visible: boolean): void;
  /** Snapshot the active web view as a PNG data URL (or null if none), so the chrome can show a still
   *  of the page while the live view is briefly hidden — e.g. during a sidebar resize drag. */
  captureActiveTab(): Promise<string | null>;
  getTabsState(): Promise<TabsState>;
  onTabsState(callback: (state: TabsState) => void): () => void;
  // Chrome-like tab tear-off. The strip streams the drag once it leaves the strip; main drives a
  // floating preview window and performs the cross-window move (merge / new window) on release.
  /** A strip drag has torn out: begin a tear session and show the floating preview chip. */
  beginTabDrag(payload: TabDragBegin): void;
  /** Reposition the floating preview to the cursor (screen coords) during a torn drag. */
  moveTabDrag(point: TabDragPoint): void;
  /** Torn drag released: main hit-tests the drop → merge into a window's strip, or a new window. */
  endTabDrag(point: TabDragPoint): void;
  /** Torn drag cancelled (Esc / invalid): tear down the preview, no move. */
  cancelTabDrag(): void;
  /** Report this window's strip geometry (client coords) so main can hit-test cross-window drops. */
  reportTabStrip(geometry: TabStripGeometry): void;
  // Find-in-page (Ctrl+F). The bar lives in the chrome; the search runs on the active tab's view in
  // main, so the page never sees the query as page-level input.
  /** Run/step a find on the active tab. Fire-and-forget; counts arrive via `onFindResult`. */
  findInPage(query: FindInPageQuery): void;
  /** Stop finding and clear the page's highlight + selection. */
  stopFindInPage(): void;
  /** Main→renderer: match counts for an in-flight query. */
  onFindResult(callback: (result: FindInPageResult) => void): () => void;
  /** Main→renderer: Ctrl+F was pressed while the page had focus — open the bar. */
  onFindOpen(callback: () => void): () => void;
  /** Open a fresh empty browser window (main-menu "New window"). */
  newWindow(): void;
}
