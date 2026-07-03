import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  decodeBoundaryError,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type AppNotification,
  type BookmarkEntry,
  type ContentBounds,
  type CredentialsStatus,
  type ExtensionId,
  type HistoryEntry,
  type IpcChannel,
  type McpServerStatusInfo,
  type NotificationPermissionRequest,
  type NotificationPermissionResponse,
  type NotificationState,
  type Preferences,
  type ProviderId,
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
  getCredentialsStatus: () => invoke<CredentialsStatus>(IpcChannels.credentialsStatus),
  setProviderKey: (provider: ProviderId, apiKey: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsSet, { provider, apiKey }),
  removeProviderKey: (provider: ProviderId) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsRemove, { provider }),
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
  getUserAgent: () => invoke<string | null>(IpcChannels.userAgentGet),
  setUserAgent: (ua: string | null) => invoke<string | null>(IpcChannels.userAgentSet, ua),
  getMcpStatus: () => invoke<McpServerStatusInfo[]>(IpcChannels.mcpGetStatus),
  onOpenExtension: (callback: (id: ExtensionId) => void) => {
    const listener = (_event: unknown, id: ExtensionId): void => {
      callback(id);
    };
    ipcRenderer.on(IpcChannels.extensionOpen, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.extensionOpen, listener);
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
  getHistory: () => invoke<HistoryEntry[]>(IpcChannels.historyList),
  searchHistory: (query: string) => invoke<HistoryEntry[]>(IpcChannels.historySearch, query),
  deleteHistory: (url: string) => invoke<HistoryEntry[]>(IpcChannels.historyDelete, url),
  clearHistory: () => invoke<HistoryEntry[]>(IpcChannels.historyClear),
  listBookmarks: () => invoke<BookmarkEntry[]>(IpcChannels.bookmarksList),
  toggleBookmark: (url: string, title: string) =>
    invoke<boolean>(IpcChannels.bookmarksToggle, { url, title }),
  isBookmarked: (url: string) => invoke<boolean>(IpcChannels.bookmarksIsBookmarked, url),
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
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);
