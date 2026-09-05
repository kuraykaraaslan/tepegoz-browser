import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAgentConfigIpc` — the Agent panel's config + token-usage + export IPC. Pinned: it applies
 * the persisted strict-guard at registration; `agentGetConfig` builds the KEY-list picker (one entry
 * per stored key + the on-device entry) with the effective provider / pinned model / autonomy /
 * effort; `agentSelectChoice` promotes a key to the vault front (or the local override) and 404s an
 * unknown id; `agentSetModel` rejects an off-catalog id (400) and otherwise pins it on the provider's
 * top key; the autonomy / effort / strict-guard setters validate then persist (strict-guard also
 * re-applies); and the export handlers require the agent enabled, delegate the write to
 * FileOperationsHost, and reveal the result.
 */

const helpers = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, p: unknown) => unknown>(),
  actions: new Map<string, (path: string) => void>(),
}));
vi.mock('./ipc-helpers', () => ({
  handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => helpers.handlers.set(c, fn),
  handleAsync: (c: string, fn: (e: unknown, p: unknown) => unknown) => helpers.handlers.set(c, fn),
  onAction: (c: string, _schema: unknown, fn: (path: string) => void) => helpers.actions.set(c, fn),
}));

const shell = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
  openPath: vi.fn(() => Promise.resolve()),
}));
vi.mock('electron', () => ({ shell }));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: {
    tokenUsageGet: 'token:get',
    agentGetConfig: 'agent:getConfig',
    agentSelectChoice: 'agent:selectChoice',
    agentSetModel: 'agent:setModel',
    agentSetAutonomy: 'agent:setAutonomy',
    agentSetEffort: 'agent:setEffort',
    agentSetStrictGuard: 'agent:setStrictGuard',
    agentExportConversation: 'agent:exportConv',
    agentExportBundle: 'agent:exportBundle',
    agentOpenFile: 'agent:openFile',
  },
  LOCAL_CHOICE_ID: '__local',
  PROVIDER_IDS: ['anthropic', 'openai'],
  AGENT_EFFORT_LEVELS: ['low', 'medium', 'high'],
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  AgentExportBundleSchema: { parse: (x: unknown) => x },
  AgentExportConversationSchema: { parse: (x: unknown) => x },
  AgentOpenFileSchema: {},
}));

const modelGateway = vi.hoisted(() => ({
  isProviderRegistered: vi.fn(() => false),
  setModelOverride: vi.fn(),
}));
vi.mock('@tepegoz/model-gateway', () => ({
  ModelGateway: modelGateway,
  PROVIDER_MODEL_CATALOG: {
    anthropic: [{ id: 'claude-x', label: 'Claude X' }],
    openai: [{ id: 'gpt-x', label: 'GPT X' }],
  },
}));
const hotSwapRunProvider = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/agent-runtime', () => ({ hotSwapRunProvider }));
const hasActiveAgentRun = vi.hoisted(() => vi.fn(() => false));
vi.mock('../agent/agent-run-lock.electron', () => ({ hasActiveAgentRun }));
vi.mock('../agent/export-bundle.electron', () => ({
  collectAgentExportBundleFiles: vi.fn(() => Promise.resolve([{ relPath: 'a', content: 'x' }])),
}));

vi.mock('@tepegoz/shared-types', () => ({
  AI_PROVIDERS: ['anthropic', 'openai'],
  isRunnableProvider: (p: string) => p === 'anthropic' || p === 'openai',
  SelectableAgentAutonomySchema: { parse: (x: unknown) => x },
}));

const vault = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  status: vi.fn(() => ({ anthropic: true, openai: false })),
  listMeta: vi.fn(() => [
    { id: 'k1', provider: 'anthropic', label: 'work', last4: '1234' },
    { id: 'k2', provider: 'openai', label: 'personal', last4: '' },
  ]),
  listMetaByProvider: vi.fn((p: string) =>
    p === 'anthropic' ? [{ id: 'k1', provider: 'anthropic' }] : [],
  ),
  modelForProvider: vi.fn(() => 'claude-x'),
  topProvider: vi.fn<() => string | null>(() => 'anthropic'),
  reorderKeys: vi.fn(),
  setKeyModel: vi.fn(),
  getFirstKeyForProvider: vi.fn(() => 'sk-x'),
}));
vi.mock('@tepegoz/credential-vault', () => ({ default: vault }));

const fsHost = vi.hoisted(() => ({
  writeExport: vi.fn(() => Promise.resolve('/home/u/tepegoz/log.txt')),
  writeExportBundle: vi.fn(() => Promise.resolve('/home/u/tepegoz/bundle')),
  assertOpenablePath: vi.fn(() => Promise.resolve('/home/u/tepegoz/real.txt')),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fsHost }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(
    (): {
      agentProviderOverride: string | null;
      localProvider: { selectedModelId: string; mode: string };
      agentAutonomy: string;
      agentEffort: string;
      agentStrictGuard: boolean;
    } => ({
      agentProviderOverride: null,
      localProvider: { selectedModelId: '', mode: 'tiered' },
      agentAutonomy: 'notify',
      agentEffort: 'medium',
      agentStrictGuard: false,
    }),
  ),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({
  default: prefs,
  DEFAULT_PREFERENCES: {},
  PreferencesPatchSchema: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));

const applyStrictGuard = vi.hoisted(() => vi.fn());
vi.mock('./strict-guard', () => ({ applyStrictGuard }));

const shared = vi.hoisted(() => ({
  agentEnabled: vi.fn(() => true),
  requireAgentEnabled: vi.fn(),
  tokenUsage: vi.fn(() => ({ used: 10 })),
}));
vi.mock('./ipc-agent-shared', () => shared);

const { registerAgentConfigIpc } = await import('./ipc-agent-config');

const call = (channel: string, payload?: unknown) => helpers.handlers.get(channel)!({}, payload);

beforeEach(() => {
  vi.clearAllMocks();
  helpers.handlers.clear();
  helpers.actions.clear();
  vault.status.mockReturnValue({ anthropic: true, openai: false });
  vault.listMeta.mockReturnValue([
    { id: 'k1', provider: 'anthropic', label: 'work', last4: '1234' },
    { id: 'k2', provider: 'openai', label: 'personal', last4: '' },
  ]);
  vault.listMetaByProvider.mockImplementation((p: string) =>
    p === 'anthropic' ? [{ id: 'k1', provider: 'anthropic' }] : [],
  );
  vault.topProvider.mockReturnValue('anthropic');
  vault.modelForProvider.mockReturnValue('claude-x');
  hasActiveAgentRun.mockReturnValue(false);
  modelGateway.isProviderRegistered.mockReturnValue(false);
  shared.agentEnabled.mockReturnValue(true);
  prefs.getAll.mockReturnValue({
    agentProviderOverride: null,
    localProvider: { selectedModelId: '', mode: 'tiered' },
    agentAutonomy: 'notify',
    agentEffort: 'medium',
    agentStrictGuard: false,
  });
  registerAgentConfigIpc();
});

it('applies the persisted strict guard at registration', () => {
  expect(applyStrictGuard).toHaveBeenCalled();
});

it('tokenUsageGet returns the shared token-usage snapshot', () => {
  expect(call('token:get')).toEqual({ used: 10 });
});

describe('agentGetConfig', () => {
  it('builds the KEY-list picker + on-device entry with the effective provider / model / posture', () => {
    const cfg = call('agent:getConfig') as {
      provider: string;
      selectedId: string;
      model: string;
      autonomy: string;
      effort: string;
      strictGuard: boolean;
      choices: { id: string; provider: string; available: boolean }[];
    };
    expect(cfg.provider).toBe('anthropic'); // topProvider, runnable
    expect(cfg.selectedId).toBe('k1');
    expect(cfg.model).toBe('claude-x');
    expect(cfg).toMatchObject({ autonomy: 'notify', effort: 'medium', strictGuard: false });
    expect(cfg.choices.map((c) => c.id)).toEqual(['k1', 'k2', '__local']);
    expect(cfg.choices.at(-1)).toMatchObject({ provider: 'local', available: false });
  });

  it('selects the on-device id when the effective provider is local', () => {
    prefs.getAll.mockReturnValue({
      agentProviderOverride: 'local',
      localProvider: { selectedModelId: 'phi-3', mode: 'tiered' },
      agentAutonomy: 'notify',
      agentEffort: 'medium',
      agentStrictGuard: false,
    });
    const cfg = call('agent:getConfig') as { provider: string; selectedId: string };
    expect(cfg.provider).toBe('local');
    expect(cfg.selectedId).toBe('__local');
  });

  it('a runnable non-local override WITH a stored key wins, and an empty selectedId falls back when the effective provider has no key metadata', () => {
    vault.status.mockReturnValue({ anthropic: true, openai: true });
    prefs.getAll.mockReturnValue({
      agentProviderOverride: 'openai',
      localProvider: { selectedModelId: '', mode: 'tiered' },
      agentAutonomy: 'notify',
      agentEffort: 'medium',
      agentStrictGuard: false,
    });
    const cfg = call('agent:getConfig') as { provider: string; selectedId: string };
    expect(cfg.provider).toBe('openai');
    // listMetaByProvider('openai') is [] in this fixture, so `?? ''` is what supplies selectedId.
    expect(cfg.selectedId).toBe('');
  });

  it('falls back to local when mode is "default" and a local model is selected, with no override', () => {
    prefs.getAll.mockReturnValue({
      agentProviderOverride: null,
      localProvider: { selectedModelId: 'phi-3', mode: 'default' },
      agentAutonomy: 'notify',
      agentEffort: 'medium',
      agentStrictGuard: false,
    });
    const cfg = call('agent:getConfig') as { provider: string };
    expect(cfg.provider).toBe('local');
  });

  it('falls back to anthropic when the vault has no top provider at all', () => {
    vault.topProvider.mockReturnValue(null);
    const cfg = call('agent:getConfig') as { provider: string };
    expect(cfg.provider).toBe('anthropic');
  });
});

describe('agentSelectChoice', () => {
  it('the on-device id sets the local override', () => {
    call('agent:selectChoice', '__local');
    expect(prefs.update).toHaveBeenCalledWith({ agentProviderOverride: 'local' });
  });

  it('404s an unknown key id', () => {
    expect(() => call('agent:selectChoice', 'nope')).toThrow(
      expect.objectContaining({ statusCode: 404 }) as Error,
    );
  });

  it('promotes a real key to the vault front + sets the provider override, hot-swapping a live run', () => {
    hasActiveAgentRun.mockReturnValue(true);
    call('agent:selectChoice', 'k2');
    expect(vault.reorderKeys).toHaveBeenCalledWith(['k2', 'k1']);
    expect(prefs.update).toHaveBeenCalledWith({ agentProviderOverride: 'openai' });
    expect(hotSwapRunProvider).toHaveBeenCalledWith('openai', expect.anything());
  });
});

describe('agentSetModel', () => {
  it('rejects an id that is not in the provider catalog (400)', () => {
    expect(() => call('agent:setModel', { provider: 'anthropic', model: 'ghost' })).toThrow(
      expect.objectContaining({ statusCode: 400 }) as Error,
    );
  });

  it("pins a catalog id on the provider's top key", () => {
    call('agent:setModel', { provider: 'anthropic', model: 'claude-x' });
    expect(vault.setKeyModel).toHaveBeenCalledWith('k1', 'claude-x');
  });

  it('pushes the pin to the live gateway when a run is active on that provider', () => {
    hasActiveAgentRun.mockReturnValue(true);
    modelGateway.isProviderRegistered.mockReturnValue(true);
    call('agent:setModel', { provider: 'anthropic', model: 'claude-x' });
    expect(modelGateway.setModelOverride).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-x',
    });
  });

  it('pushes null (clear) to the live gateway when the pin is cleared on an active provider', () => {
    hasActiveAgentRun.mockReturnValue(true);
    modelGateway.isProviderRegistered.mockReturnValue(true);
    call('agent:setModel', { provider: 'anthropic', model: '' });
    expect(modelGateway.setModelOverride).toHaveBeenCalledWith(null);
  });
});

describe('the posture setters', () => {
  it('autonomy / effort validate then persist', () => {
    call('agent:setAutonomy', 'act');
    call('agent:setEffort', 'high');
    expect(prefs.update).toHaveBeenCalledWith({ agentAutonomy: 'act' });
    expect(prefs.update).toHaveBeenCalledWith({ agentEffort: 'high' });
  });

  it('strict-guard persists AND re-applies immediately', () => {
    call('agent:setStrictGuard', true);
    expect(prefs.update).toHaveBeenCalledWith({ agentStrictGuard: true });
    expect(applyStrictGuard).toHaveBeenCalledTimes(2); // once at register, once here
  });
});

describe('the export handlers', () => {
  it('agentExportConversation writes via FileOperationsHost and reveals the file', async () => {
    const full = await call('agent:exportConv', { content: 'the transcript' });
    expect(shared.requireAgentEnabled).toHaveBeenCalled();
    expect(fsHost.writeExport).toHaveBeenCalledWith(
      expect.stringMatching(/^ai_agent_log_.*\.txt$/),
      'the transcript',
    );
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/home/u/tepegoz/log.txt');
    expect(full).toBe('/home/u/tepegoz/log.txt');
  });

  it('agentExportBundle collects the files, writes the bundle folder and reveals it', async () => {
    const dir = await call('agent:exportBundle', { groupId: 'g1', transcript: [] });
    expect(fsHost.writeExportBundle).toHaveBeenCalledWith(
      expect.stringMatching(/^ai_agent_export_/),
      [{ relPath: 'a', content: 'x' }],
    );
    expect(dir).toBe('/home/u/tepegoz/bundle');
  });

  it('agentOpenFile: no-op when the agent is disabled, else assert-then-open, logging a refusal', async () => {
    shared.agentEnabled.mockReturnValue(false);
    helpers.actions.get('agent:openFile')!('/x');
    expect(fsHost.assertOpenablePath).not.toHaveBeenCalled();

    shared.agentEnabled.mockReturnValue(true);
    fsHost.assertOpenablePath.mockRejectedValueOnce(new Error('outside grant'));
    helpers.actions.get('agent:openFile')!('/danger.exe');
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        'Refused to open agent file',
        expect.objectContaining({ err: expect.stringContaining('outside grant') as string }),
      ),
    );
  });

  it('agentOpenFile opens the asserted real path on the happy path', async () => {
    helpers.actions.get('agent:openFile')!('/home/u/tepegoz/real.txt');
    await vi.waitFor(() =>
      expect(shell.openPath).toHaveBeenCalledWith('/home/u/tepegoz/real.txt'),
    );
  });
});
