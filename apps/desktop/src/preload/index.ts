import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  decodeBoundaryError,
  type AgentApprovalRequest,
  type AgentAutonomy,
  type AgentConfig,
  type AgentEffort,
  type AgentEvent,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type AppNotification,
  type AutofillAvailablePayload,
  type BookmarkEntry,
  type BookmarkMenuAction,
  type BookmarkNodeType,
  type BookmarkTreeNode,
  type ContentBounds,
  type CredentialsStatus,
  type ExtensionContextMenuChoice,
  type ExtensionId,
  type ExtensionManifestWire,
  type FileAccessFolderPickResult,
  type HistoryEntry,
  type IpcChannel,
  type LocalModelInfo,
  type LoginCredentialMeta,
  type LoginImportResult,
  type Macro,
  type MacroRecordedStep,
  type MacroRunDraftInput,
  type MacroRunInput,
  type MacroRunProgress,
  type MacroSummary,
  type AIAdaptor,
  type McpServerStatusInfo,
  type NotificationPermissionRequest,
  type NotificationPermissionResponse,
  type NotificationState,
  type PageMenuAction,
  type PageMenuContext,
  type PopupBlockerRequest,
  type PopupBlockerSettings,
  type Preferences,
  type ProviderId,
  type ProviderKeyMeta,
  type PublicSettings,
  type TabGroupColor,
  type TabsState,
  type TepegozApi,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';

/** Every request/response call goes through here so a rejection reaches the renderer as the typed
 *  `{ message, statusCode }` pair (IpcBoundaryError) the boundary encoded — ADR-0009. */
async function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T;
  } catch (err) {
    throw decodeBoundaryError(err);
  }
}

/**
 * The ONLY bridge between renderer and main. A small, named, typed API — never raw ipcRenderer
 * (electron-desktop-security BLOCKING).
 */
const api: TepegozApi = {
  getAppInfo: () => invoke<AppInfo>(IpcChannels.appGetInfo),
  getPreferences: () => invoke<Preferences>(IpcChannels.prefsGet),
  updatePreferences: (patch: Partial<Preferences>) =>
    invoke<Preferences>(IpcChannels.prefsSet, patch),
  resetPreferences: () => invoke<Preferences>(IpcChannels.prefsReset),
  getPublicSettings: () => invoke<PublicSettings>(IpcChannels.publicSettingsGet),
  onPublicSettingsChanged: (callback: (settings: PublicSettings) => void) => {
    const listener = (_event: unknown, settings: PublicSettings): void => {
      callback(settings);
    };
    ipcRenderer.on(IpcChannels.publicSettingsChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.publicSettingsChanged, listener);
    };
  },
  getCredentialsStatus: () => invoke<CredentialsStatus>(IpcChannels.credentialsStatus),
  listCredentials: () => invoke<ProviderKeyMeta[]>(IpcChannels.credentialsList),
  addProviderKey: (provider: ProviderId, label: string, apiKey: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsAdd, { provider, label, apiKey }),
  removeProviderKeyById: (id: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsRemoveById, { keyId: id }),
  renameProviderKey: (id: string, label: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsRename, { keyId: id, label }),
  reorderProviderKeys: (orderedIds: string[]) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsReorder, { orderedIds }),
  minimizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMinimize);
  },
  toggleMaximizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMaximizeToggle);
  },
  closeWindow: () => {
    ipcRenderer.send(IpcChannels.windowClose);
  },
  isWindowMaximized: () => invoke<boolean>(IpcChannels.windowIsMaximized),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean): void => {
      callback(maximized);
    };
    ipcRenderer.on(IpcChannels.windowMaximizedChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, listener);
    };
  },
  createTab: (url?: string) => {
    ipcRenderer.send(IpcChannels.tabsCreate, url);
  },
  createTabInBackground: (url: string) => {
    ipcRenderer.send(IpcChannels.tabsCreateBackground, url);
  },
  closeTab: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsClose, id);
  },
  activateTab: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsActivate, id);
  },
  showTabContextMenu: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsContextMenu, id);
  },
  navigateTab: (input: string) => {
    ipcRenderer.send(IpcChannels.tabsNavigate, input);
  },
  tabGoBack: () => {
    ipcRenderer.send(IpcChannels.tabsGoBack);
  },
  tabGoForward: () => {
    ipcRenderer.send(IpcChannels.tabsGoForward);
  },
  tabReload: () => {
    ipcRenderer.send(IpcChannels.tabsReload);
  },
  tabHome: () => {
    ipcRenderer.send(IpcChannels.tabsHome);
  },
  reopenClosedTab: () => {
    ipcRenderer.send(IpcChannels.tabsReopenClosed);
  },
  moveTab: (id: string, toIndex: number, intoGroupId?: string | null) => {
    ipcRenderer.send(IpcChannels.tabsMove, { id, toIndex, intoGroupId });
  },
  setTabPinned: (id: string, pinned: boolean) => {
    ipcRenderer.send(IpcChannels.tabsPin, { id, pinned });
  },
  createTabGroup: (memberIds?: string[]) => {
    ipcRenderer.send(IpcChannels.tabsGroupCreate, { memberIds });
  },
  moveTabGroup: (groupId: string, toIndex: number) => {
    ipcRenderer.send(IpcChannels.tabsGroupMove, { groupId, toIndex });
  },
  updateTabGroup: (groupId: string, patch: { name?: string; color?: TabGroupColor; collapsed?: boolean }) => {
    ipcRenderer.send(IpcChannels.tabsGroupUpdate, { groupId, ...patch });
  },
  assignTabToGroup: (tabId: string, groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupAssign, { tabId, groupId });
  },
  removeTabFromGroup: (tabId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupRemove, tabId);
  },
  ungroupTabGroup: (groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsUngroup, groupId);
  },
  showTabGroupContextMenu: (groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupContextMenu, groupId);
  },
  onTabGroupStartRename: (callback: (groupId: string) => void) => {
    const listener = (_event: unknown, groupId: string): void => {
      callback(groupId);
    };
    ipcRenderer.on(IpcChannels.tabsGroupStartRename, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsGroupStartRename, listener);
    };
  },
  setContentBounds: (bounds: ContentBounds) => {
    ipcRenderer.send(IpcChannels.tabsSetBounds, bounds);
  },
  setContentVisible: (visible: boolean) => {
    ipcRenderer.send(IpcChannels.tabsSetContentVisible, visible);
  },
  captureActiveTab: () => invoke<string | null>(IpcChannels.tabsCapture),
  getTabsState: () => invoke<TabsState>(IpcChannels.tabsGetState),
  onTabsState: (callback: (state: TabsState) => void) => {
    const listener = (_event: unknown, state: TabsState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.tabsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsState, listener);
    };
  },
  runAgent: (prompt: string) => invoke<AgentRunResult>(IpcChannels.agentRun, prompt),
  cancelAgent: (runId: string) => {
    ipcRenderer.send(IpcChannels.agentCancel, runId);
  },
  newAgentConversation: () => {
    ipcRenderer.send(IpcChannels.agentNewConversation);
  },
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const listener = (_event: unknown, payload: AgentEvent): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.agentEvent, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentEvent, listener);
    };
  },
  onAgentApprovalRequest: (callback: (request: AgentApprovalRequest) => void) => {
    const listener = (_event: unknown, payload: AgentApprovalRequest): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.agentApprovalRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentApprovalRequest, listener);
    };
  },
  respondAgentApproval: (approvalId: string, approved: boolean) => {
    ipcRenderer.send(IpcChannels.agentApprovalResponse, { approvalId, approved });
  },
  onAgentPlanPreview: (callback: (preview: AgentPlanPreview) => void) => {
    const listener = (_event: unknown, payload: AgentPlanPreview): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.agentPlanPreview, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentPlanPreview, listener);
    };
  },
  respondAgentPlan: (planId: string, approved: boolean, skipStepIds?: string[]) => {
    ipcRenderer.send(IpcChannels.agentPlanResponse, { planId, approved, skipStepIds });
  },
  onTokenUsage: (callback: (usage: TokenUsageSnapshot) => void) => {
    const listener = (_event: unknown, payload: TokenUsageSnapshot): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.tokenUsage, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tokenUsage, listener);
    };
  },
  getTokenUsage: () => invoke<TokenUsageSnapshot>(IpcChannels.tokenUsageGet),
  getAgentConfig: () => invoke<AgentConfig>(IpcChannels.agentGetConfig),
  setAgentProvider: (provider: ProviderId) => invoke<void>(IpcChannels.agentSetProvider, provider),
  setAgentAutonomy: (level: AgentAutonomy) => invoke<void>(IpcChannels.agentSetAutonomy, level),
  setAgentEffort: (level: AgentEffort) => invoke<void>(IpcChannels.agentSetEffort, level),
  openAgentFile: (path: string) => {
    ipcRenderer.send(IpcChannels.agentOpenFile, path);
  },
  listLocalModels: () => invoke<LocalModelInfo[]>(IpcChannels.modelsList),
  downloadLocalModel: (id: string) => invoke<void>(IpcChannels.modelsDownload, id),
  cancelLocalModelDownload: (id: string) => {
    ipcRenderer.send(IpcChannels.modelsCancel, id);
  },
  selectLocalModel: (id: string) => invoke<void>(IpcChannels.modelsSelect, id),
  deleteLocalModel: (id: string) => invoke<void>(IpcChannels.modelsDelete, id),
  onLocalModelsState: (callback: (models: LocalModelInfo[]) => void) => {
    const listener = (_event: unknown, models: LocalModelInfo[]): void => {
      callback(models);
    };
    ipcRenderer.on(IpcChannels.modelsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.modelsState, listener);
    };
  },
  getUserAgent: () => invoke<string | null>(IpcChannels.userAgentGet),
  setUserAgent: (ua: string | null) => invoke<string | null>(IpcChannels.userAgentSet, ua),
  getPopupBlockerSettings: () => invoke<PopupBlockerSettings>(IpcChannels.popupBlockerGet),
  setPopupBlockerSettings: (patch: Partial<PopupBlockerSettings>) =>
    invoke<PopupBlockerSettings>(IpcChannels.popupBlockerSet, patch),
  trustPopupOrigin: (origin: string) => {
    ipcRenderer.send(IpcChannels.popupBlockerTrust, origin);
  },
  getRecentRequests: () => invoke<PopupBlockerRequest[]>(IpcChannels.popupBlockerRecentRequests),
  getMcpStatus: () => invoke<McpServerStatusInfo[]>(IpcChannels.mcpGetStatus),
  listAiAdaptors: () => invoke<AIAdaptor[]>(IpcChannels.aiAdaptorsList),
  listExtensionManifests: () =>
    invoke<ExtensionManifestWire[]>(IpcChannels.extensionsListManifests),
  onOpenExtension: (callback: (id: ExtensionId) => void) => {
    const listener = (_event: unknown, id: ExtensionId): void => {
      callback(id);
    };
    ipcRenderer.on(IpcChannels.extensionOpen, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.extensionOpen, listener);
    };
  },
  showExtensionContextMenu: (id: ExtensionId) => {
    ipcRenderer.send(IpcChannels.extensionContextMenu, id);
  },
  onExtensionContextMenuAction: (callback: (choice: ExtensionContextMenuChoice) => void) => {
    const listener = (_event: unknown, choice: ExtensionContextMenuChoice): void => {
      callback(choice);
    };
    ipcRenderer.on(IpcChannels.extensionContextMenuAction, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.extensionContextMenuAction, listener);
    };
  },
  openPopup: (surface: string, anchor: ContentBounds, opts?: { id?: string; height?: number }) => {
    ipcRenderer.send(IpcChannels.popupOpen, {
      surface,
      id: opts?.id,
      anchor,
      height: opts?.height,
    });
  },
  resizePopup: (height: number) => {
    ipcRenderer.send(IpcChannels.popupResize, { height });
  },
  closePopup: () => {
    ipcRenderer.send(IpcChannels.popupClose);
  },
  onPopupClosed: (callback: (surface: string) => void) => {
    const listener = (_event: unknown, surface: string): void => {
      callback(surface);
    };
    ipcRenderer.on(IpcChannels.popupClosed, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.popupClosed, listener);
    };
  },
  quitApp: () => {
    ipcRenderer.send(IpcChannels.appQuit);
  },
  openSubmenu: (kind: string, anchor: ContentBounds, opts?: { height?: number }) => {
    ipcRenderer.send(IpcChannels.submenuOpen, { kind, anchor, height: opts?.height });
  },
  closeSubmenu: () => {
    ipcRenderer.send(IpcChannels.submenuClose);
  },
  getPageMenuContext: () => invoke<PageMenuContext>(IpcChannels.pageMenuGetContext),
  pageMenuAction: (action: PageMenuAction) => {
    ipcRenderer.send(IpcChannels.pageMenuAction, action);
  },
  getHistory: (params?: { limit?: number; offset?: number }) =>
    invoke<HistoryEntry[]>(IpcChannels.historyList, params),
  searchHistory: (params: { query: string; limit?: number; offset?: number }) =>
    invoke<HistoryEntry[]>(IpcChannels.historySearch, params),
  deleteHistory: (url: string) => invoke<void>(IpcChannels.historyDelete, url),
  clearHistory: () => invoke<void>(IpcChannels.historyClear),
  listBookmarks: () => invoke<BookmarkEntry[]>(IpcChannels.bookmarksList),
  toggleBookmark: (url: string, title: string, favicon?: string | null) =>
    invoke<boolean>(IpcChannels.bookmarksToggle, { url, title, favicon }),
  isBookmarked: (url: string) => invoke<boolean>(IpcChannels.bookmarksIsBookmarked, url),
  getBookmarkTree: () => invoke<BookmarkTreeNode[]>(IpcChannels.bookmarksTree),
  createBookmarkFolder: (parentId: string, title: string, index?: number) =>
    invoke<void>(IpcChannels.bookmarksCreateFolder, { parentId, title, index }),
  renameBookmark: (id: string, title: string) =>
    invoke<void>(IpcChannels.bookmarksRename, { id, title }),
  removeBookmark: (id: string) => invoke<void>(IpcChannels.bookmarksRemove, id),
  moveBookmark: (id: string, newParentId: string, index: number) =>
    invoke<void>(IpcChannels.bookmarksMove, { id, newParentId, index }),
  showBookmarkContextMenu: (
    id: string,
    type: BookmarkNodeType,
    variant?: 'default' | 'folder-item',
  ) => {
    ipcRenderer.send(IpcChannels.bookmarksContextMenu, { id, type, variant });
  },
  onBookmarkMenuAction: (callback: (action: BookmarkMenuAction) => void) => {
    const listener = (_event: unknown, action: BookmarkMenuAction): void => callback(action);
    ipcRenderer.on(IpcChannels.bookmarksMenuAction, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.bookmarksMenuAction, listener);
    };
  },
  onBookmarksChanged: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on(IpcChannels.bookmarksChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.bookmarksChanged, listener);
    };
  },
  listNotifications: () => invoke<NotificationState>(IpcChannels.notificationsList),
  onNotificationsState: (callback: (state: NotificationState) => void) => {
    const listener = (_event: unknown, state: NotificationState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.notificationsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationsState, listener);
    };
  },
  onNotificationToast: (callback: (toast: AppNotification) => void) => {
    const listener = (_event: unknown, toast: AppNotification): void => {
      callback(toast);
    };
    ipcRenderer.on(IpcChannels.notificationsToast, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationsToast, listener);
    };
  },
  dismissNotification: (id: string) => {
    ipcRenderer.send(IpcChannels.notificationsDismiss, id);
  },
  dismissAllNotifications: () => {
    ipcRenderer.send(IpcChannels.notificationsDismissAll);
  },
  markNotificationRead: (id: string) => {
    ipcRenderer.send(IpcChannels.notificationsMarkRead, id);
  },
  markAllNotificationsRead: () => {
    ipcRenderer.send(IpcChannels.notificationsMarkAllRead);
  },
  onNotificationPermissionRequest: (callback: (request: NotificationPermissionRequest) => void) => {
    const listener = (_event: unknown, request: NotificationPermissionRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.notificationPermissionRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationPermissionRequest, listener);
    };
  },
  respondNotificationPermission: (response: NotificationPermissionResponse) => {
    ipcRenderer.send(IpcChannels.notificationPermissionRespond, response);
  },
  // File operations (Settings → File operations). The grant list rides on preferences; only the native
  // folder picker needs a bridge method (AI-driven consent reuses the agent HITL modal).
  pickFileAccessFolder: () =>
    invoke<FileAccessFolderPickResult>(IpcChannels.fileAccessPickFolder),
  // Login credential manager. Raw secrets never cross this bridge — only metadata returns.
  listLogins: () => invoke<LoginCredentialMeta[]>(IpcChannels.loginsList),
  setLogin: (credential: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }) =>
    invoke<LoginCredentialMeta>(IpcChannels.loginsSet, {
      url: credential.url,
      username: credential.username,
      secret: credential.password,
      title: credential.title,
      notes: credential.notes,
    }),
  removeLogin: (id: string) => invoke<void>(IpcChannels.loginsRemove, id),
  importLogins: (data: string, format: string) =>
    invoke<LoginImportResult>(IpcChannels.loginsImport, { data, format }),
  exportLogins: (format: string) => invoke<string>(IpcChannels.loginsExport, format),
  onAutofillAvailable: (callback: (payload: AutofillAvailablePayload) => void) => {
    const listener = (_event: unknown, payload: AutofillAvailablePayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.loginsAutofillAvailable, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.loginsAutofillAvailable, listener);
    };
  },
  fillLogin: (credentialId: string) => {
    ipcRenderer.send(IpcChannels.loginsFill, { credentialId });
  },
  // Macros (ext-macros).
  listMacros: () => invoke<MacroSummary[]>(IpcChannels.macrosList),
  getMacro: (id: string) => invoke<Macro | null>(IpcChannels.macrosGet, id),
  saveMacro: (macro: Macro) => invoke<MacroSummary>(IpcChannels.macrosSave, macro),
  deleteMacro: (id: string) => invoke<void>(IpcChannels.macrosDelete, id),
  attachMacroCsv: (content: string) => invoke<string>(IpcChannels.macrosAttachCsv, { content }),
  runMacro: (input: MacroRunInput) => invoke<{ runId: string }>(IpcChannels.macrosRun, input),
  runDraftMacro: (input: MacroRunDraftInput) =>
    invoke<{ runId: string }>(IpcChannels.macrosRunDraft, input),
  cancelMacro: (runId: string) => {
    ipcRenderer.send(IpcChannels.macrosCancel, runId);
  },
  onMacroRunProgress: (callback: (progress: MacroRunProgress) => void) => {
    const listener = (_event: unknown, payload: MacroRunProgress): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.macrosRunProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.macrosRunProgress, listener);
    };
  },
  startMacroRecording: () => invoke<void>(IpcChannels.macrosRecordStart),
  stopMacroRecording: () => invoke<void>(IpcChannels.macrosRecordStop),
  onMacroRecordStep: (callback: (step: MacroRecordedStep) => void) => {
    const listener = (_event: unknown, payload: MacroRecordedStep): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.macrosRecordStep, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.macrosRecordStep, listener);
    };
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);
