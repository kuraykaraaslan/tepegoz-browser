import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type ContentBounds,
  type CredentialsStatus,
  type ExtensionId,
  type HistoryEntry,
  type Preferences,
  type ProviderId,
  type TabsState,
  type TepegozApi,
  type TokenUsageSnapshot,
} from '../shared/ipc-contract';

/**
 * The ONLY bridge between renderer and main. A small, named, typed API — never raw ipcRenderer
 * (electron-desktop-security BLOCKING).
 */
const api: TepegozApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo) as Promise<AppInfo>,
  getPreferences: () => ipcRenderer.invoke(IpcChannels.prefsGet) as Promise<Preferences>,
  updatePreferences: (patch: Partial<Preferences>) =>
    ipcRenderer.invoke(IpcChannels.prefsSet, patch) as Promise<Preferences>,
  getCredentialsStatus: () =>
    ipcRenderer.invoke(IpcChannels.credentialsStatus) as Promise<CredentialsStatus>,
  setProviderKey: (provider: ProviderId, apiKey: string) =>
    ipcRenderer.invoke(IpcChannels.credentialsSet, { provider, apiKey }) as Promise<CredentialsStatus>,
  removeProviderKey: (provider: ProviderId) =>
    ipcRenderer.invoke(IpcChannels.credentialsRemove, { provider }) as Promise<CredentialsStatus>,
  minimizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMinimize);
  },
  toggleMaximizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMaximizeToggle);
  },
  closeWindow: () => {
    ipcRenderer.send(IpcChannels.windowClose);
  },
  isWindowMaximized: () =>
    ipcRenderer.invoke(IpcChannels.windowIsMaximized) as Promise<boolean>,
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
  setContentBounds: (bounds: ContentBounds) => {
    ipcRenderer.send(IpcChannels.tabsSetBounds, bounds);
  },
  setContentVisible: (visible: boolean) => {
    ipcRenderer.send(IpcChannels.tabsSetContentVisible, visible);
  },
  getTabsState: () => ipcRenderer.invoke(IpcChannels.tabsGetState) as Promise<TabsState>,
  onTabsState: (callback: (state: TabsState) => void) => {
    const listener = (_event: unknown, state: TabsState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.tabsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsState, listener);
    };
  },
  runAgent: (prompt: string) =>
    ipcRenderer.invoke(IpcChannels.agentRun, prompt) as Promise<AgentRunResult>,
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
  getTokenUsage: () => ipcRenderer.invoke(IpcChannels.tokenUsageGet) as Promise<TokenUsageSnapshot>,
  getUserAgent: () => ipcRenderer.invoke(IpcChannels.userAgentGet) as Promise<string | null>,
  setUserAgent: (ua: string | null) =>
    ipcRenderer.invoke(IpcChannels.userAgentSet, ua) as Promise<string | null>,
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
  getHistory: () => ipcRenderer.invoke(IpcChannels.historyList) as Promise<HistoryEntry[]>,
  searchHistory: (query: string) =>
    ipcRenderer.invoke(IpcChannels.historySearch, query) as Promise<HistoryEntry[]>,
  deleteHistory: (url: string) =>
    ipcRenderer.invoke(IpcChannels.historyDelete, url) as Promise<HistoryEntry[]>,
  clearHistory: () => ipcRenderer.invoke(IpcChannels.historyClear) as Promise<HistoryEntry[]>,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);
