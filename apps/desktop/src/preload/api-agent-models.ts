import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentAutonomy,
  type AgentConfig,
  type AgentConversationDetail,
  type AgentConversationListInput,
  type AgentConversationOpenInput,
  type AgentConversationSummary,
  type AgentConversationsState,
  type AgentEffort,
  type AgentEvent,
  type AgentFileAttachment,
  type AgentPlanPreview,
  type AgentRunResult,
  type AIAdaptor,
  type ExtensionContextMenuChoice,
  type ExtensionId,
  type ExtensionManifestWire,
  type LocalModelInfo,
  type McpServerStatusInfo,
  type ProviderId,
  type AdaptorConnection,
  type TepegozApi,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Agent run/config + local model management + MCP status/AI-adaptors + extension registry bridge
 *  methods. Split out of `index.ts` (ADR-0010 250-line cap). */
export const agentModelsApi: Pick<
  TepegozApi,
  | 'runAgent'
  | 'cancelAgent'
  | 'getActiveTabUrl'
  | 'newAgentConversation'
  | 'listAgentConversations'
  | 'getAgentConversation'
  | 'getCurrentAgentConversation'
  | 'openAgentConversation'
  | 'deleteAgentConversation'
  | 'clearAgentConversations'
  | 'onAgentConversationsState'
  | 'onAgentEvent'
  | 'onAgentApprovalRequest'
  | 'respondAgentApproval'
  | 'onAgentPlanPreview'
  | 'respondAgentPlan'
  | 'onTokenUsage'
  | 'getTokenUsage'
  | 'getAgentConfig'
  | 'setAgentProvider'
  | 'setAgentAutonomy'
  | 'setAgentEffort'
  | 'openAgentFile'
  | 'capturePageSelection'
  | 'pickAgentFiles'
  | 'capturePageScreenshot'
  | 'listLocalModels'
  | 'downloadLocalModel'
  | 'cancelLocalModelDownload'
  | 'selectLocalModel'
  | 'deleteLocalModel'
  | 'onLocalModelsState'
  | 'getMcpStatus'
  | 'listAdaptors'
  | 'listAiAdaptors'
  | 'listExtensionManifests'
  | 'onOpenExtension'
  | 'showExtensionContextMenu'
  | 'onExtensionContextMenuAction'
> = {
  runAgent: (input: Parameters<TepegozApi['runAgent']>[0]) =>
    invoke<AgentRunResult>(IpcChannels.agentRun, input),
  cancelAgent: (runId: string) => {
    ipcRenderer.send(IpcChannels.agentCancel, runId);
  },
  getActiveTabUrl: () => invoke<string | null>(IpcChannels.agentActiveTabUrl),
  newAgentConversation: (groupId: string) => {
    ipcRenderer.send(IpcChannels.agentNewConversation, groupId);
  },
  listAgentConversations: (input?: AgentConversationListInput) =>
    invoke<AgentConversationSummary[]>(IpcChannels.agentConversationsList, input ?? {}),
  getAgentConversation: (id: string) =>
    invoke<AgentConversationDetail | null>(IpcChannels.agentConversationsGet, id),
  getCurrentAgentConversation: (groupId: string) =>
    invoke<AgentConversationDetail | null>(IpcChannels.agentConversationsCurrent, groupId),
  openAgentConversation: (input: AgentConversationOpenInput) =>
    invoke<AgentConversationDetail | null>(IpcChannels.agentConversationsOpen, input),
  deleteAgentConversation: (id: string) =>
    invoke<void>(IpcChannels.agentConversationsDelete, id),
  clearAgentConversations: () => invoke<void>(IpcChannels.agentConversationsClear),
  onAgentConversationsState: (callback: (state: AgentConversationsState) => void) => {
    const listener = (_event: unknown, payload: AgentConversationsState): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.agentConversationsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentConversationsState, listener);
    };
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
  capturePageSelection: () => invoke<string>(IpcChannels.agentCaptureSelection),
  pickAgentFiles: () => invoke<AgentFileAttachment[]>(IpcChannels.agentPickFiles),
  capturePageScreenshot: () => invoke<string | null>(IpcChannels.tabsCapture),
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
  getMcpStatus: () => invoke<McpServerStatusInfo[]>(IpcChannels.mcpGetStatus),
  listAdaptors: () => invoke<AdaptorConnection[]>(IpcChannels.adaptorsList),
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
};
