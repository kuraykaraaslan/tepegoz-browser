/**
 * Tab strip, find, zoom and task-manager channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsTabs = {
  tabsCreate: 'tabs:create',
  tabsCreateBackground: 'tabs:create-background',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsNavigate: 'tabs:navigate',
  tabsGoBack: 'tabs:go-back',
  tabsGoForward: 'tabs:go-forward',
  tabsReload: 'tabs:reload',
  tabsHome: 'tabs:home',
  /** Renderer→main: reopen a closed tab — the most recent one, or a specific entry by its id. */
  tabsReopenClosed: 'tabs:reopen-closed',
  /** Renderer→main (invoke): the recently-closed list backing the History menu's section. */
  tabsRecentlyClosed: 'tabs:recently-closed',
  /** Renderer→main: close the tabs this launch's session restore reopened (the restore toast's Undo,
   *  ADR-0038). Session-scoped and expiring — see `recovery/session-restore-undo.ts`. */
  sessionUndoRestore: 'session:undo-restore',
  tabsContextMenu: 'tabs:context-menu',
  tabsSetBounds: 'tabs:set-bounds',
  tabsSetContentVisible: 'tabs:set-content-visible',
  tabsCapture: 'tabs:capture',
  tabsGetState: 'tabs:get-state',
  tabsState: 'tabs:state',
  // Advanced tab UX (ADR-0020): drag-reorder, groups, and pinning. All fire-and-forget mutations;
  // state is pushed back via `tabs:state`.
  tabsMove: 'tabs:move',
  tabsPin: 'tabs:pin',
  /** Renderer→main: hide/unhide a tab (leaves the strip but keeps its view alive + rendering). */
  tabsSetHidden: 'tabs:set-hidden',
  /** Renderer→main: pop the native "Hidden tabs" menu (anchored to the caption button) to unhide. */
  tabsHiddenMenu: 'tabs:hidden-menu',
  /** Renderer→main: pop the active tab's back/forward history dropdown (right-click a nav button). */
  tabsHistoryMenu: 'tabs:history-menu',
  tabsGroupCreate: 'tabs:group-create',
  tabsGroupMove: 'tabs:group-move',
  tabsGroupUpdate: 'tabs:group-update',
  tabsGroupAssign: 'tabs:group-assign',
  tabsGroupRemove: 'tabs:group-remove',
  tabsUngroup: 'tabs:ungroup',
  /** Renderer→main: pop the native group context menu (anchored to the sender window). */
  tabsGroupContextMenu: 'tabs:group-context-menu',
  /** Main→renderer: open the inline rename editor for a group (from the group menu's Rename item). */
  tabsGroupStartRename: 'tabs:group-start-rename',
  // Chrome-like tab tear-off. The source renderer streams the drag (screen coords) so the MAIN process
  // can drive a floating preview window and, on release, hit-test other windows' strips → merge, or an
  // empty desktop → new window. Renderers also report their strip geometry so main can hit-test drops.
  /** Renderer→main: a strip drag left the strip; begin a tear session (dragged tab/group + preview chip). */
  tabsDragBegin: 'tabs:drag-begin',
  /** Renderer→main: pointer moved during a torn drag (screen coords) — reposition the floating preview. */
  tabsDragMove: 'tabs:drag-move',
  /** Renderer→main: torn drag released (screen coords) — perform the merge / new-window move. */
  tabsDragEnd: 'tabs:drag-end',
  /** Renderer→main: torn drag cancelled (Esc / drop failed) — tear down the preview, no move. */
  tabsDragCancel: 'tabs:drag-cancel',
  /** Renderer→main: this window's tab-strip geometry (client coords) for cross-window drop hit-testing. */
  tabsReportStrip: 'tabs:report-strip',
  /** Find-in-page (Ctrl+F). Runs against the sender window's ACTIVE tab; internal pages have no view. */
  findStart: 'find:start',
  /** Stop the search and clear the page's selection/highlights. */
  findStop: 'find:stop',
  /** main→renderer: Chromium's match counts for the query that is still in flight. */
  findResult: 'find:result',
  /** main→renderer: Ctrl+F arrived while the PAGE had focus, so the chrome must open the bar itself. */
  findOpen: 'find:open',
  /** Renderer→main: step/reset the sender window's ACTIVE tab zoom (omnibox zoom indicator buttons).
   *  The updated factor rides back on the next `tabs:state`, not a dedicated push. */
  zoomCommand: 'zoom:command',
  /** Renderer→main (invoke): the sender window's ACTIVE tab zoom as a whole-number percent. For the
   *  main-menu popup, which is a child window with no `tabs:state` subscription of its own. */
  zoomGet: 'zoom:get',
  /** Task manager (`tepegoz://process`). `get` returns a fresh `ProcessSnapshot` from
   *  `app.getAppMetrics()`; `end` force-crashes one tab's renderer process. The page polls `get`
   *  itself — there is no push. */
  processMetricsGet: 'process-metrics:get',
  processMetricsEnd: 'process-metrics:end',
  /** Renderer→main: open a fresh empty browser window (main-menu "New window"). */
  windowNew: 'window:new',
} as const;
