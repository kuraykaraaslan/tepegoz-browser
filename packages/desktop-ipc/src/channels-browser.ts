/**
 * Extensions, popups, page menu, history, bookmarks, permissions, screenshot and reader channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsBrowser = {
  /** Renderer→main: the identity of every built-in extension (from the validated on-disk catalog). */
  extensionsListManifests: 'extensions:list-manifests',
  /** Main→renderer push: run this extension's click action (relayed from the Extensions panel popup,
   *  which lives in its own window and so cannot touch the chrome's surface state directly). */
  extensionOpen: 'extension:open',
  /** Popup→main: ask main to relay `extensionOpen` to the owning chrome window (and close the popup). */
  extensionOpenRequest: 'extension:open-request',
  /** Renderer→main: pop the native context menu for a toolbar extension icon (settings page / remove). */
  extensionContextMenu: 'extension:context-menu',
  /** Main→renderer push: the action chosen from an extension icon's context menu (`page` | `remove`). */
  extensionContextMenuAction: 'extension:context-menu-action',
  popupOpen: 'popup:open',
  popupResize: 'popup:resize',
  popupClose: 'popup:close',
  popupClosed: 'popup:closed',
  submenuOpen: 'submenu:open',
  submenuClose: 'submenu:close',
  // Web-page (WebContentsView) right-click menu: rendered as a native popup window from the MAIN
  // process. The popup surface pulls the captured context, then dispatches the chosen action.
  pageMenuGetContext: 'page-menu:get-context',
  pageMenuAction: 'page-menu:action',
  pageMenuContributionAction: 'page-menu:contribution-action',
  appQuit: 'app:quit',
  /** Restart the app. The only way a startup-only setting (GPU compositing) can be made to take. */
  appRelaunch: 'app:relaunch',
  historyList: 'history:list',
  historySearch: 'history:search',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
  historyExport: 'history:export',
  /** Renderer→main: plan a per-site data clear (what it would cover, what it would break). */
  siteDataPlan: 'site-data:plan',
  /** Renderer→main: perform the clear the user just confirmed. */
  siteDataClear: 'site-data:clear',
  /** Renderer→main: the full Site Info bubble payload for one page URL (connection, certificate,
   *  cookie count, per-origin permissions). */
  pageInfoGet: 'page-info:get',
  bookmarksList: 'bookmarks:list',
  bookmarksToggle: 'bookmarks:toggle',
  bookmarksIsBookmarked: 'bookmarks:is-bookmarked',
  // Bookmark tree (folders + ordering) — the interactive bar + manager.
  bookmarksTree: 'bookmarks:tree',
  bookmarksCreateFolder: 'bookmarks:create-folder',
  bookmarksRename: 'bookmarks:rename',
  bookmarksRemove: 'bookmarks:remove',
  bookmarksMove: 'bookmarks:move',
  bookmarksImport: 'bookmarks:import',
  /** Browser profiles found on this computer, and importing one of them by id. Read-only detection,
   *  run when the user opens the import step — never on a timer, and never with a renderer-named path. */
  /** main → chrome: focus + select the address bar (Ctrl+L / Alt+D, pressed while a page had focus). */
  /** The unified "Clear browsing data" action (range + categories). Per-site forget is separate. */
  browsingDataClear: 'privacy:clear-browsing-data',
  /** Data Rights — subject-access export (Phase 7 KVKK/GDPR self-service). Searches the local Agent
   *  Conversation history + Event Journal for a subject and writes a portable SAR document to
   *  `~/tepegoz/` → { subject, matchedTurns, matchedEvents, filePath }. */
  dataRightsExport: 'privacy:data-rights-export',
  omniboxFocus: 'omnibox:focus',
  /** main → chrome: Ctrl/Cmd+K arrived (any focus context) — toggle the Command Palette. `main` scope
   *  like `find`/`omniboxFocus`, so it works while a browsed PAGE has focus, not only the chrome. */
  commandPaletteOpen: 'command-palette:open',
  bookmarksDetectProfiles: 'bookmarks:detect-profiles',
  bookmarksImportProfile: 'bookmarks:import-profile',
  /** The whole collection as Netscape bookmarks HTML — the format every other browser reads. */
  /** Open a new PRIVATE (disposable) window. Takes no payload — there is nothing for an untrusted
   *  renderer to steer, which is the whole reason it can be a plain renderer-callable channel. */
  /** Permissions Center: the agent matrix, computed in main by asking the Policy Kernel. Site
   *  permissions need no channel of their own — they are ordinary preferences and go through the
   *  already-validated preferences write path. */
  agentCapabilitiesList: 'permissions:agent-list',
  /** Permission Debug (S8 PR7): past Policy Kernel decisions read back from the Event Journal, filtered
   *  by site/tool. Read-only history, distinct from `agentCapabilitiesList`'s live baseline view. */
  permissionDecisionHistory: 'permissions:decision-history',
  /**
   * User screenshot. `screenshotCapture` is renderer→main (take one); the other two are the WebP
   * re-encode round trip — `NativeImage` cannot encode WebP and Chromium can, but only in a renderer.
   */
  screenshotCapture: 'screenshot:capture',
  screenshotEncode: 'screenshot:encode',
  screenshotEncoded: 'screenshot:encoded',
  /** Reading view: extract the active tab's article as structured blocks (never HTML). */
  readerExtract: 'reader:extract',
  /** main → renderer: the user asked for the reading view (menu row or Ctrl+Shift+R). */
  readerToggle: 'reader:toggle',
  windowsOpenPrivate: 'windows:open-private',
  bookmarksExport: 'bookmarks:export',
  /** Bookmark tags: replace one bookmark's set, and read the whole tag list with counts. */
  bookmarksSetTags: 'bookmarks:set-tags',
  bookmarksListTags: 'bookmarks:list-tags',
  bookmarksContextMenu: 'bookmarks:context-menu',
  bookmarksMenuAction: 'bookmarks:menu-action',
  /** Main→renderer: the bookmark tree changed (incl. from a popup window) → refetch. */
  bookmarksChanged: 'bookmarks:changed',
} as const;
