/**
 * IPC channel names (`domain:action`) + internal page addresses — split from `contract.ts` to keep
 * each file under the 250-line cap. Same constraint applies: imported by the SANDBOXED preload, so
 * this file must stay dependency-free.
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  /** Restore all preferences to their defaults (does NOT touch the encrypted credential vault). */
  prefsReset: 'prefs:reset',
  /** Finish first-run onboarding and switch the window into the normal browser chrome. */
  onboardingComplete: 'onboarding:complete',
  // Curated public settings exposed to extensions (read-only). `changed` is a main→renderer push.
  publicSettingsGet: 'public-settings:get',
  publicSettingsChanged: 'public-settings:changed',
  credentialsStatus: 'credentials:status',
  credentialsList: 'credentials:list',
  credentialsAdd: 'credentials:add',
  credentialsRemoveById: 'credentials:remove-by-id',
  credentialsRename: 'credentials:rename',
  /** Reorder keys (drag-and-drop priority); the top key's provider becomes the default. */
  credentialsReorder: 'credentials:reorder',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  tabsCreate: 'tabs:create',
  tabsCreateBackground: 'tabs:create-background',
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
  /** Renderer→main: hide/unhide a tab (leaves the strip but keeps its view alive + rendering). */
  tabsSetHidden: 'tabs:set-hidden',
  /** Renderer→main: pop the native "Hidden tabs" menu (anchored to the caption button) to unhide. */
  tabsHiddenMenu: 'tabs:hidden-menu',
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
  /** Renderer→main: open a fresh empty browser window (main-menu "New window"). */
  windowNew: 'window:new',
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  /** Renderer→main: hold/resume a running agent between steps (not cancel). */
  agentPause: 'agent:pause',
  agentResume: 'agent:resume',
  /** Renderer→main: inject a steering message into a RUNNING agent (folds into the current run). */
  agentSteer: 'agent:steer',
  /** Renderer→main: reset conversation memory for a specific group (panel "New task"). */
  agentNewConversation: 'agent:new-conversation',
  /** Renderer→main: ensure the active tab belongs to a group; creates one if needed → { groupId }. */
  agentEnsureGroup: 'agent:ensure-group',
  /** Main→renderer push: active tab's group changed (groupId | null). */
  agentGroupChanged: 'agent:group-changed',
  /** Renderer→main: capture the page's current text selection → string. */
  agentCaptureSelection: 'agent:capture-selection',
  /** Renderer→main: the active tab's committed URL (seed a task's target page) → string | null. */
  agentActiveTabUrl: 'agent:active-tab-url',
  /** Renderer→main: open a native file picker and read selected files → AgentFileAttachment[]. */
  agentPickFiles: 'agent:pick-files',
  agentEvent: 'agent:event',
  /** Main→renderer: an UNSETTLED model-output fragment while a step runs. Ephemeral, never journaled. */
  agentDelta: 'agent:delta',
  agentApprovalRequest: 'agent:approval-request',
  agentApprovalResponse: 'agent:approval-response',
  agentPlanPreview: 'agent:plan-preview',
  agentPlanResponse: 'agent:plan-response',
  tokenUsage: 'token:usage',
  tokenUsageGet: 'token:usage-get',
  // Agent panel config: current provider + choices + autonomy level, and setters for each.
  agentGetConfig: 'agent:get-config',
  agentSetProvider: 'agent:set-provider',
  /** Renderer→main: pin a specific model for a provider (Agent panel Model dropdown); '' clears it. */
  agentSetModel: 'agent:set-model',
  agentSetAutonomy: 'agent:set-autonomy',
  /** Renderer→main: set the per-run reasoning-effort preset (Agent panel effort dropdown). */
  agentSetEffort: 'agent:set-effort',
  /** Renderer→main: toggle the hardened inbound guard (S6 PR5). Main is the only place it takes effect. */
  agentSetStrictGuard: 'agent:set-strict-guard',
  /** Renderer→main: open a file the agent produced (fire-and-forget; gated to whitelisted folders). */
  agentOpenFile: 'agent:open-file',
  /** Renderer→main: write the current chat log to the ~/tepegoz folder and reveal it → absolute path. */
  agentExportConversation: 'agent:export-conversation',
  /** Renderer→main: write a full diagnostic bundle (chat + per-tab DOM/PNG snapshots + memory + journal +
   *  manifest) into a `~/tepegoz/ai_agent_export_<stamp>/` folder and reveal it → absolute folder path. */
  agentExportBundle: 'agent:export-bundle',
  // Agent extension conversation history. The product surface is the ext-agent page, not a core page.
  agentConversationsList: 'agent-conversations:list',
  agentConversationsGet: 'agent-conversations:get',
  agentConversationsCurrent: 'agent-conversations:current',
  agentConversationsOpen: 'agent-conversations:open',
  agentConversationsDelete: 'agent-conversations:delete',
  agentConversationsClear: 'agent-conversations:clear',
  agentConversationsState: 'agent-conversations:state',
  // Skills library (S9): named prompt templates. Selecting one PRE-FILLS the composer; it never starts
  // a run, so the human keeps the send gesture that authorises the task.
  agentSkillsList: 'agent-skills:list',
  agentSkillsSave: 'agent-skills:save',
  agentSkillsDelete: 'agent-skills:delete',
  // On-device model management (Settings → Providers → Local). `models:state` is a main→renderer push.
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsSelect: 'models:select',
  modelsDelete: 'models:delete',
  modelsState: 'models:state',
  // Browser downloads (`tepegoz://downloads`). State is pushed live from the main-process DownloadService.
  downloadsList: 'downloads:list',
  downloadsCommand: 'downloads:command',
  downloadsState: 'downloads:state',
  // Browser uploads (`tepegoz://uploads`). State is pushed live from the main-process UploadService.
  uploadsList: 'uploads:list',
  uploadsCommand: 'uploads:command',
  uploadsState: 'uploads:state',
  // Saved/triggered agent tasks (`tepegoz://tasks`). State is projected by the main-process TaskService.
  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksSave: 'tasks:save',
  tasksDelete: 'tasks:delete',
  tasksRunNow: 'tasks:run-now',
  tasksCancelRun: 'tasks:cancel-run',
  tasksSetEnabled: 'tasks:set-enabled',
  tasksListRuns: 'tasks:list-runs',
  tasksListArtifacts: 'tasks:list-artifacts',
  tasksState: 'tasks:state',
  /** Renderer→main: the identity of every built-in extension (from the validated on-disk catalog). */
  extensionsListManifests: 'extensions:list-manifests',
  extensionOpen: 'extension:open',
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
  historyList: 'history:list',
  historySearch: 'history:search',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
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
  bookmarksContextMenu: 'bookmarks:context-menu',
  bookmarksMenuAction: 'bookmarks:menu-action',
  /** Main→renderer: the bookmark tree changed (incl. from a popup window) → refetch. */
  bookmarksChanged: 'bookmarks:changed',
  userAgentGet: 'user-agent:get',
  userAgentSet: 'user-agent:set',
  popupBlockerGet: 'popup-blocker:get',
  popupBlockerSet: 'popup-blocker:set',
  popupBlockerTrust: 'popup-blocker:trust',
  popupBlockerRecentRequests: 'popup-blocker:recent-requests',
  adblockGet: 'adblock:get',
  adblockSet: 'adblock:set',
  adblockState: 'adblock:state',
  adblockSiteSet: 'adblock:site-set',
  adblockRefresh: 'adblock:refresh',
  typoGet: 'typo:get',
  typoSet: 'typo:set',
  typoState: 'typo:state',
  typoCheck: 'typo:check',
  typoDictionariesList: 'typo-dictionaries:list',
  typoDictionariesState: 'typo-dictionaries:state',
  typoDictionaryDownload: 'typo-dictionaries:download',
  typoDictionaryCancel: 'typo-dictionaries:cancel',
  typoDictionaryDelete: 'typo-dictionaries:delete',
  typoDictionaryShowFolder: 'typo-dictionaries:show-folder',
  typoSiteSet: 'typo:site-set',
  typoIgnoredWordAdd: 'typo:ignored-word-add',
  translateGet: 'translate:get',
  translateSet: 'translate:set',
  translateState: 'translate:state',
  translateText: 'translate:text',
  translatePageStart: 'translate-page:start',
  translatePageRestore: 'translate-page:restore',
  translatePageState: 'translate-page:state',
  translateSiteSet: 'translate:site-set',
  translateGlossaryAdd: 'translate-glossary:add',
  translateGlossaryRemove: 'translate-glossary:remove',
  translateCloudFallbackRequest: 'translate-cloud:request',
  translateCloudFallbackRespond: 'translate-cloud:respond',
  // Unified Player (ext-video-player). `video-player:page-state` is a main→renderer push carrying the
  // number of `<video>` elements skinned on the active tab.
  videoPlayerGet: 'video-player:get',
  videoPlayerSet: 'video-player:set',
  videoPlayerState: 'video-player:state',
  videoPlayerSiteSet: 'video-player:site-set',
  videoPlayerPageState: 'video-player:page-state',
  mcpGetStatus: 'mcp:get-status',
  adaptorsList: 'adaptors:list',
  /** Renderer→main: the live AIAdaptor inventory (system + extension + MCP groups, each with its
   *  actions) for the Settings "run locally" list — built from the single CapabilityRegistry. */
  aiAdaptorsList: 'ai-adaptors:list',
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
  // Macro automation (ext-macros). Request/response CRUD + run; record start/stop is fire-and-forget
  // with main→renderer streaming pushes for captured steps and run progress.
  macrosList: 'macros:list',
  macrosGet: 'macros:get',
  macrosSave: 'macros:save',
  macrosDelete: 'macros:delete',
  macrosRun: 'macros:run',
  macrosRunDraft: 'macros:run-draft',
  macrosCancel: 'macros:cancel',
  macrosAttachCsv: 'macros:attach-csv',
  macrosRecordStart: 'macros:record-start',
  macrosRecordStop: 'macros:record-stop',
  /** Main→renderer push: a step was captured while recording. */
  macrosRecordStep: 'macros:record-step',
  /** Main→renderer push: run progress (step started/finished, run done/failed). */
  macrosRunProgress: 'macros:run-progress',
  // File operations (Settings → File operations): the folder-access whitelist that sandboxes the agent's
  // file tools. The grant LIST lives in `Preferences.fileAccessGrants` (read via prefs:get, written via
  // prefs:set — the main-process host reconciles the live FileAccessPolicy on change). The AI-driven
  // "grant this folder / allow this write" consent reuses the existing agent HITL approval modal (a file
  // op that exceeds its folder's granted mode, and every grant-management tool, fall through to it). So
  // the only dedicated channel is the native directory picker for the Settings "Add folder" button.
  fileAccessPickFolder: 'file-access:pick-folder',
  // New-tab page background image. `pick` opens a native image picker, reads + validates the file in
  // main, and stores the bytes in the content-addressed blob store (only a `cas://` ref is persisted in
  // prefs). `get` resolves a stored ref back to a `data:` URL for the renderer to paint.
  newtabPickBackgroundImage: 'newtab:pick-background-image',
  newtabGetBackgroundImage: 'newtab:get-background-image',
  /** Main→renderer push: simulated cursor position during a macro/agent run. */
  cursorPosition: 'cursor:position',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/** Internal (browser-served) page addresses, shown in the omnibox like Chrome's `chrome://` pages. */
export const INTERNAL_NEWTAB_URL = 'tepegoz://newtab';
export const INTERNAL_SETTINGS_URL = 'tepegoz://settings';
export const INTERNAL_EXTENSIONS_URL = 'tepegoz://extensions';
export const INTERNAL_HISTORY_URL = 'tepegoz://history';
export const INTERNAL_DOWNLOADS_URL = 'tepegoz://downloads';
export const INTERNAL_UPLOADS_URL = 'tepegoz://uploads';
export const INTERNAL_TASKS_URL = 'tepegoz://tasks';
export const INTERNAL_BOOKMARKS_URL = 'tepegoz://bookmarks';
