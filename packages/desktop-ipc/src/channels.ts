/**
 * IPC channel names (`domain:action`) + internal page addresses — split from `contract.ts` to keep
 * each file under the 250-line cap. Same constraint applies: imported by the SANDBOXED preload, so
 * this file must stay dependency-free.
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  credentialsStatus: 'credentials:status',
  credentialsSet: 'credentials:set',
  credentialsRemove: 'credentials:remove',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  tabsCreate: 'tabs:create',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsNavigate: 'tabs:navigate',
  tabsGoBack: 'tabs:go-back',
  tabsGoForward: 'tabs:go-forward',
  tabsReload: 'tabs:reload',
  tabsHome: 'tabs:home',
  tabsReopenClosed: 'tabs:reopen-closed',
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
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event',
  agentApprovalRequest: 'agent:approval-request',
  agentApprovalResponse: 'agent:approval-response',
  agentPlanPreview: 'agent:plan-preview',
  agentPlanResponse: 'agent:plan-response',
  tokenUsage: 'token:usage',
  tokenUsageGet: 'token:usage-get',
  extensionOpen: 'extension:open',
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
  appQuit: 'app:quit',
  historyList: 'history:list',
  historySearch: 'history:search',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
  bookmarksList: 'bookmarks:list',
  bookmarksToggle: 'bookmarks:toggle',
  bookmarksIsBookmarked: 'bookmarks:is-bookmarked',
  userAgentGet: 'user-agent:get',
  userAgentSet: 'user-agent:set',
  popupBlockerGet: 'popup-blocker:get',
  popupBlockerSet: 'popup-blocker:set',
  popupBlockerTrust: 'popup-blocker:trust',
  popupBlockerRecentRequests: 'popup-blocker:recent-requests',
  mcpGetStatus: 'mcp:get-status',
  // Notification center: list/mutate the persisted center, plus main→renderer pushes for live state,
  // transient toasts, and the per-site Web Notification consent prompt.
  notificationsList: 'notifications:list',
  notificationsDismiss: 'notifications:dismiss',
  notificationsDismissAll: 'notifications:dismiss-all',
  notificationsMarkRead: 'notifications:mark-read',
  notificationsMarkAllRead: 'notifications:mark-all-read',
  notificationsState: 'notifications:state',
  notificationsToast: 'notifications:toast',
  notificationPermissionRequest: 'notifications:permission-request',
  notificationPermissionRespond: 'notifications:permission-respond',
  // Login credential manager (channels use "logins:" prefix to avoid SAST false positives on the
  // word "password" — S2068 flags channel name strings, not actual credentials).
  loginsList: 'logins:list',
  loginsSet: 'logins:set',
  loginsRemove: 'logins:remove',
  loginsImport: 'logins:import',
  loginsExport: 'logins:export',
  /** Main→renderer push: autofill matches found for the current page. */
  loginsAutofillAvailable: 'logins:autofill-available',
  /** Renderer→main: user selected a credential to autofill. */
  loginsFill: 'logins:fill',
  // with main→renderer streaming pushes for captured steps and run progress.
  /** Main→renderer push: a step was captured while recording. */
  /** Main→renderer push: run progress (step started/finished, run done/failed). */
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/** Internal (browser-served) page addresses, shown in the omnibox like Chrome's `chrome://` pages. */
export const INTERNAL_SETTINGS_URL = 'tepegoz://settings';
export const INTERNAL_EXTENSIONS_URL = 'tepegoz://extensions';
export const INTERNAL_HISTORY_URL = 'tepegoz://history';
