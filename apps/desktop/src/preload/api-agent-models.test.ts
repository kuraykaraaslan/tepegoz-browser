import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The agent-run + conversation + skills + token + config + local-model + adaptor slice of the preload
 * bridge (~60 methods, one shape). Data-driven pin of channel + payload for the bulk, plus the
 * methods that reshape their args: setAgentModel → {provider, model}, steerAgent → {runId, text},
 * respondAgentApproval / respondAgentPlan → their named objects, listAgentConversations → (input ?? {}).
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { agentModelsApi: api } = await import('./api-agent-models');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

type Row = [name: string, run: () => unknown, channel: string, payload?: unknown];

const INVOKES: Row[] = [
  ['getActiveTabUrl', () => api.getActiveTabUrl(), IpcChannels.agentActiveTabUrl],
  [
    'clearAgentConversations',
    () => api.clearAgentConversations(),
    IpcChannels.agentConversationsClear,
  ],
  [
    'continueAgentInBackground',
    () => api.continueAgentInBackground(),
    IpcChannels.agentContinueInBackground,
  ],
  ['listAgentSkills', () => api.listAgentSkills(), IpcChannels.agentSkillsList],
  ['getTokenUsage', () => api.getTokenUsage(), IpcChannels.tokenUsageGet],
  ['getAgentConfig', () => api.getAgentConfig(), IpcChannels.agentGetConfig],
  ['capturePageSelection', () => api.capturePageSelection(), IpcChannels.agentCaptureSelection],
  ['pickAgentFiles', () => api.pickAgentFiles(), IpcChannels.agentPickFiles],
  ['listLocalModels', () => api.listLocalModels(), IpcChannels.modelsList],
  ['getMcpStatus', () => api.getMcpStatus(), IpcChannels.mcpGetStatus],
  ['listAdaptors', () => api.listAdaptors(), IpcChannels.adaptorsList],
  ['listAiAdaptors', () => api.listAiAdaptors(), IpcChannels.aiAdaptorsList],
  [
    'getAgentConversation',
    () => api.getAgentConversation('c1'),
    IpcChannels.agentConversationsGet,
    'c1',
  ],
  [
    'deleteAgentConversation',
    () => api.deleteAgentConversation('c1'),
    IpcChannels.agentConversationsDelete,
    'c1',
  ],
  ['selectAgentChoice', () => api.selectAgentChoice('k1'), IpcChannels.agentSelectChoice, 'k1'],
  ['setAgentAutonomy', () => api.setAgentAutonomy('ask'), IpcChannels.agentSetAutonomy, 'ask'],
  ['setAgentEffort', () => api.setAgentEffort('high'), IpcChannels.agentSetEffort, 'high'],
  [
    'setAgentStrictGuard',
    () => api.setAgentStrictGuard(true),
    IpcChannels.agentSetStrictGuard,
    true,
  ],
  ['downloadLocalModel', () => api.downloadLocalModel('m1'), IpcChannels.modelsDownload, 'm1'],
  ['selectLocalModel', () => api.selectLocalModel('m1'), IpcChannels.modelsSelect, 'm1'],
  ['deleteLocalModel', () => api.deleteLocalModel('m1'), IpcChannels.modelsDelete, 'm1'],
  [
    'setAgentModel',
    () => api.setAgentModel('anthropic', 'claude-x'),
    IpcChannels.agentSetModel,
    { provider: 'anthropic', model: 'claude-x' },
  ],
  [
    'listAgentConversations (no input)',
    () => api.listAgentConversations(),
    IpcChannels.agentConversationsList,
    {},
  ],
  [
    'runAgent',
    () => api.runAgent({ prompt: 'go', groupId: 'g1' }),
    IpcChannels.agentRun,
    { prompt: 'go', groupId: 'g1' },
  ],
  [
    'getCurrentAgentConversation',
    () => api.getCurrentAgentConversation('g1'),
    IpcChannels.agentConversationsCurrent,
    'g1',
  ],
  [
    'openAgentConversation',
    () => api.openAgentConversation({ id: 'c1', groupId: 'g1' }),
    IpcChannels.agentConversationsOpen,
    { id: 'c1', groupId: 'g1' },
  ],
  [
    'saveAgentSkill',
    () => api.saveAgentSkill({ name: 'S', prompt: 'p' }),
    IpcChannels.agentSkillsSave,
    { name: 'S', prompt: 'p' },
  ],
  ['deleteAgentSkill', () => api.deleteAgentSkill('s1'), IpcChannels.agentSkillsDelete, 's1'],
  [
    'exportChatLog',
    () => api.exportChatLog({ content: 'log' }),
    IpcChannels.agentExportConversation,
    { content: 'log' },
  ],
  [
    'exportAgentBundle',
    () => api.exportAgentBundle({ conversationId: 'c1' } as never),
    IpcChannels.agentExportBundle,
    { conversationId: 'c1' },
  ],
  ['capturePageScreenshot', () => api.capturePageScreenshot(), IpcChannels.tabsCapture],
  [
    'listExtensionManifests',
    () => api.listExtensionManifests(),
    IpcChannels.extensionsListManifests,
  ],
];

const SENDS: Row[] = [
  ['cancelAgent', () => api.cancelAgent('r1'), IpcChannels.agentCancel, 'r1'],
  ['pauseAgent', () => api.pauseAgent('r1'), IpcChannels.agentPause, 'r1'],
  ['resumeAgent', () => api.resumeAgent('r1'), IpcChannels.agentResume, 'r1'],
  [
    'newAgentConversation',
    () => api.newAgentConversation('g1'),
    IpcChannels.agentNewConversation,
    'g1',
  ],
  ['openAgentFile', () => api.openAgentFile('/tmp/x'), IpcChannels.agentOpenFile, '/tmp/x'],
  [
    'steerAgent',
    () => api.steerAgent('r1', 'try again'),
    IpcChannels.agentSteer,
    { runId: 'r1', text: 'try again' },
  ],
  [
    'respondAgentApproval',
    () => api.respondAgentApproval('a1', true, true, false),
    IpcChannels.agentApprovalResponse,
    { approvalId: 'a1', approved: true, remember: true, grantScope: false },
  ],
  [
    'respondAgentPlan',
    () => api.respondAgentPlan('p1', false, ['s2']),
    IpcChannels.agentPlanResponse,
    { planId: 'p1', approved: false, skipStepIds: ['s2'] },
  ],
  [
    'cancelLocalModelDownload',
    () => api.cancelLocalModelDownload('m1'),
    IpcChannels.modelsCancel,
    'm1',
  ],
  [
    'requestOpenExtension',
    () => api.requestOpenExtension('ext-1'),
    IpcChannels.extensionOpenRequest,
    'ext-1',
  ],
  [
    'showExtensionContextMenu',
    () => api.showExtensionContextMenu('ext-1'),
    IpcChannels.extensionContextMenu,
    'ext-1',
  ],
];

type SubRow = [name: string, run: (cb: (p: unknown) => void) => () => void, channel: string];
const SUBSCRIPTIONS: SubRow[] = [
  ['onAgentConversationsState', (cb) => api.onAgentConversationsState(cb), IpcChannels.agentConversationsState],
  ['onAgentEvent', (cb) => api.onAgentEvent(cb), IpcChannels.agentEvent],
  ['onAgentApprovalRequest', (cb) => api.onAgentApprovalRequest(cb), IpcChannels.agentApprovalRequest],
  ['onAgentPlanPreview', (cb) => api.onAgentPlanPreview(cb), IpcChannels.agentPlanPreview],
  ['onTokenUsage', (cb) => api.onTokenUsage(cb), IpcChannels.tokenUsage],
  ['onLocalModelsState', (cb) => api.onLocalModelsState(cb), IpcChannels.modelsState],
  ['onOpenExtension', (cb) => api.onOpenExtension(cb), IpcChannels.extensionOpen],
  ['onExtensionContextMenuAction', (cb) => api.onExtensionContextMenuAction(cb), IpcChannels.extensionContextMenuAction],
];

describe('invoke methods', () => {
  it.each(INVOKES)('%s', (_n, run, channel, payload) => {
    run();
    if (payload === undefined) expect(invoke).toHaveBeenCalledWith(channel);
    else expect(invoke).toHaveBeenCalledWith(channel, payload);
  });
});

describe('ipcRenderer.send methods', () => {
  it.each(SENDS)('%s', (_n, run, channel, payload) => {
    run();
    expect(ipc.send).toHaveBeenCalledWith(channel, payload);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('respondAgentApproval passes undefined flags through untouched', () => {
  it('when the optional remember / grantScope args are omitted', () => {
    api.respondAgentApproval('a1', true);
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.agentApprovalResponse, {
      approvalId: 'a1',
      approved: true,
      remember: undefined,
      grantScope: undefined,
    });
  });
});

describe('a representative subscription', () => {
  it('onAgentDelta forwards the payload and unsubscribes the exact listener', () => {
    const cb = vi.fn();
    const off = api.onAgentDelta(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, d: unknown) => void;
    listener({}, { text: 'chunk' });
    expect(cb).toHaveBeenCalledWith({ text: 'chunk' });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.agentDelta, listener);
  });
});

describe('every remaining subscription: subscribe, forward only the payload, unsubscribe', () => {
  it.each(SUBSCRIPTIONS)('%s', (_n, run, channel) => {
    const cb = vi.fn();
    const off = run(cb);
    expect(ipc.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({ senderId: 1 }, { sample: true });
    expect(cb).toHaveBeenCalledWith({ sample: true });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
