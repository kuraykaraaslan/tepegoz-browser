import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  decodeBoundaryError,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type BookmarkEntry,
  type ContentBounds,
  type CredentialsStatus,
  type ExtensionId,
  type HistoryEntry,
  type IpcChannel,
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
  reopenClosedTab: () => {
    ipcRenderer.send(IpcChannels.tabsReopenClosed);
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
  showMainMenu: () => {
    ipcRenderer.send(IpcChannels.menuShowMain);
  },
  onOpenExtension: (callback: (id: ExtensionId) => void) => {
    const listener = (_event: unknown, id: ExtensionId): void => {
      callback(id);
    };
    ipcRenderer.on(IpcChannels.extensionOpen, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.extensionOpen, listener);
    };
  },
  openExtensionPopup: (id: ExtensionId, anchor: ContentBounds) => {
    ipcRenderer.send(IpcChannels.extensionPopupOpen, { id, anchor });
  },
  closeExtensionPopup: () => {
    ipcRenderer.send(IpcChannels.extensionPopupClose);
  },
  onExtensionPopupClosed: (callback: () => void) => {
    const listener = (): void => {
      callback();
    };
    ipcRenderer.on(IpcChannels.extensionPopupClosed, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.extensionPopupClosed, listener);
    };
  },
  getHistory: () => invoke<HistoryEntry[]>(IpcChannels.historyList),
  searchHistory: (query: string) => invoke<HistoryEntry[]>(IpcChannels.historySearch, query),
  deleteHistory: (url: string) => invoke<HistoryEntry[]>(IpcChannels.historyDelete, url),
  clearHistory: () => invoke<HistoryEntry[]>(IpcChannels.historyClear),
  listBookmarks: () => invoke<BookmarkEntry[]>(IpcChannels.bookmarksList),
  toggleBookmark: (url: string, title: string) =>
    invoke<boolean>(IpcChannels.bookmarksToggle, { url, title }),
  isBookmarked: (url: string) => invoke<boolean>(IpcChannels.bookmarksIsBookmarked, url),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);
