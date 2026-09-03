import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAgentRunIpc` — the `agent:run` handler that streams live events + round-trips HITL
 * approvals. Pinned: it refuses when the agent extension is disabled and 409s a second run for a
 * group already running; a real run claims the per-group lock + tray indicator, runs through
 * `AgentService.run`, maps the summary (with a validated completion outcome) and ALWAYS releases every
 * claim in `finally`; the pre-flight token-quota gate throws 429 (and still refunds + releases); the
 * injected `onEvent` streams to the sender and raises a handoff notification; `onModelDelta` streams a
 * schema-checked fragment with a first-feedback stamp only on the first; and a throwing setup step
 * releases every claim before rethrowing.
 */

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({
  AppError,
  Logger: { redact: (s: string) => s, warn: vi.fn(), info: vi.fn() },
}));

const IpcChannels = {
  agentRun: 'agent:run',
  agentEvent: 'agent:event',
  agentDelta: 'agent:delta',
  agentApprovalRequest: 'agent:approval-request',
  agentPlanPreview: 'agent:plan-preview',
  tokenUsage: 'token:usage',
};
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels }));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({ AgentRunInputSchema: { safeParse: vi.fn() } }));

const AgentDeltaSchema = vi.hoisted(() => ({
  safeParse: vi.fn<(v: unknown) => { success: boolean; data?: unknown }>((v: unknown) => ({
    success: true,
    data: v,
  })),
}));
const CompletionOutcomeSchema = vi.hoisted(() => ({
  safeParse: vi.fn((v: unknown) =>
    v !== undefined ? { success: true as const, data: v } : { success: false as const },
  ),
}));
vi.mock('@tepegoz/shared-types', () => ({
  AgentDeltaSchema,
  CompletionOutcomeSchema,
  MAX_DELTA_TEXT: 2000,
  NEVER_AUTO_GRANTABLE_TIERS: [] as string[],
}));

const PlanGrantStore = vi.hoisted(() => ({
  revoke: vi.fn(),
  covers: vi.fn(() => ({ covered: false })),
  mint: vi.fn(() => ({ domains: [], tiers: [] })),
  grantFromApproval: vi.fn(() => ({ domains: [], tiers: [] })),
}));
vi.mock('@tepegoz/security-policy', () => ({
  PlanGrantStore,
  REMEMBERED_GRANT_DAYS: 30,
  resolveAutonomy: vi.fn(() => ({ decision: 'ask' })),
}));
vi.mock('@tepegoz/capability-plane', () => ({
  CapabilityRegistry: { get: vi.fn(() => undefined) },
}));

vi.mock('@tepegoz/model-gateway', () => ({
  TokenLedger: { runScoped: (fn: () => unknown) => fn(), snapshotEntries: vi.fn(() => []) },
}));

const TokenStore = vi.hoisted(() => ({
  lifetimeTotals: vi.fn(() => ({ totalTokens: 0 })),
  recordRun: vi.fn(),
  refundRun: vi.fn(),
}));
const EventJournal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal, TokenStore }));

vi.mock('node:crypto', () => ({ randomUUID: () => 'uuid-x' }));

const AgentService = vi.hoisted(() => ({
  run: vi.fn<
    (p: string, h: unknown, g: string, dp: string, b: unknown) => Promise<Record<string, unknown>>
  >(() => Promise.resolve({ ok: true, stoppedReason: 'complete', completionOutcome: 'verified' })),
  beginHistoryTurn: vi.fn((): unknown => null),
  appendHistoryEvent: vi.fn(),
}));
vi.mock('../agent/agent-service.electron', () => ({ default: AgentService }));

const bh = vi.hoisted(() => ({
  browserHost: { listTabs: vi.fn(() => [] as { active?: boolean; url?: string }[]) },
  releaseAgentRun: vi.fn(),
  setCurrentAgentRun: vi.fn(),
  withAgentRunScope: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock('../agent/browser-host.electron', () => bh);

vi.mock('../tabs', () => ({
  default: { getState: vi.fn(() => ({ tabs: [] as unknown[], activeId: null })) },
}));
vi.mock('../agent/plan-grant-scope', () => ({
  planGrantScope: vi.fn(() => ({ urls: [], tiers: [] })),
}));
vi.mock('../agent/remembered-grant-scope', () => ({
  mayOfferRemember: vi.fn(() => false),
  rememberGrant: vi.fn(() => null),
  rememberedCoverage: vi.fn(() => ({ covered: false })),
  resolveSkillScope: vi.fn(() => null),
}));
const runLock = vi.hoisted(() => ({
  createRunControl: vi.fn(() => ({ signal: { aborted: false } })),
  unregisterRunControl: vi.fn(),
}));
vi.mock('../agent/agent-run-lock.electron', () => runLock);
vi.mock('../file-operations/file-operations-host', () => ({
  default: { consentDecision: vi.fn(() => Promise.resolve({ type: 'auto', approved: true })) },
}));

const getDb = vi.hoisted(() => vi.fn((): unknown => null));
vi.mock('../db/database.electron', () => ({ getDb }));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    agent: {
      handoff: { notifyTitle: 'Handoff' },
      notifications: { approvalNeededTitle: 'Approval needed' },
      grants: { remembered: 'remembered {skill}', used: 'used {skill}' },
    },
  }),
}));
const setTrayAgentRunning = vi.hoisted(() => vi.fn());
vi.mock('../tray', () => ({ setTrayAgentRunning }));
const NotificationHost = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../notifications/notification-host', () => ({ default: NotificationHost }));

const PreferenceStore = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ agentTokenQuota: 0, agentAutonomy: 'ask' })),
}));
vi.mock('@tepegoz/preferences', () => ({ default: PreferenceStore }));

const cap = vi.hoisted(
  (): { fn?: (e: unknown, p: unknown) => Promise<Record<string, unknown>> } => ({}),
);
vi.mock('./ipc-helpers', () => ({
  handleAsync: vi.fn(
    (_ch: string, fn: (e: unknown, p: unknown) => Promise<Record<string, unknown>>) => {
      cap.fn = fn;
    },
  ),
  parsePayload: vi.fn((_s: unknown, p: unknown) => p),
}));

const shared = vi.hoisted(() => ({
  agentRunByGroup: new Map<string, boolean>(),
  broadcastConversationsState: vi.fn(),
  isHistoryKind: () => false,
  JOURNAL_TYPE_BY_KIND: {},
  maybeWarnQuota: vi.fn(),
  pendingApprovals: new Map<string, unknown>(),
  pendingPlans: new Map<string, unknown>(),
  REFUNDABLE_STOP_REASONS: new Set(['network_lost']),
  requireAgentEnabled: vi.fn(),
  safeArgsPreview: vi.fn(() => ({})),
  tokenUsage: vi.fn(() => ({})),
}));
vi.mock('./ipc-agent-shared', () => shared);

const { registerAgentRunIpc } = await import('./ipc-agent-run');

type Hooks = {
  onEvent: (k: string, m: string, d?: string) => void;
  onModelDelta: (t: string) => void;
  onCheckpoint: (c: unknown) => void;
};
const hooksArg = (): Hooks => AgentService.run.mock.calls[0]![1] as Hooks;

let send: ReturnType<typeof vi.fn>;
let event: { sender: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } };
const run = (over: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
  cap.fn!(event, {
    prompt: 'do it',
    groupId: 'g1',
    displayPrompt: 'Do it',
    attachmentMeta: [],
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  shared.requireAgentEnabled.mockReset();
  AgentService.beginHistoryTurn.mockReset();
  shared.agentRunByGroup.clear();
  shared.pendingApprovals.clear();
  shared.pendingPlans.clear();
  getDb.mockReturnValue(null);
  AgentService.run.mockResolvedValue({
    ok: true,
    stoppedReason: 'complete',
    completionOutcome: 'verified',
  });
  AgentService.beginHistoryTurn.mockReturnValue(null);
  TokenStore.lifetimeTotals.mockReturnValue({ totalTokens: 0 });
  PreferenceStore.getAll.mockReturnValue({ agentTokenQuota: 0, agentAutonomy: 'ask' });
  AgentDeltaSchema.safeParse.mockImplementation((v: unknown) => ({
    success: true as const,
    data: v,
  }));
  send = vi.fn();
  event = { sender: { isDestroyed: () => false, send } };
  registerAgentRunIpc();
});

describe('the guards', () => {
  it('rejects when the agent extension is disabled', async () => {
    shared.requireAgentEnabled.mockImplementation(() => {
      throw new AppError('Agent disabled', 403);
    });
    await expect(run()).rejects.toMatchObject({ statusCode: 403 });
    expect(setTrayAgentRunning).not.toHaveBeenCalled();
  });

  it('409s a second run for a group already running', async () => {
    shared.agentRunByGroup.set('g1', true);
    await expect(run()).rejects.toMatchObject({ statusCode: 409, code: 'agentRunInProgress' });
    expect(setTrayAgentRunning).not.toHaveBeenCalled();
  });
});

describe('a real run', () => {
  it('claims the locks, runs, maps the summary, and releases every claim in finally', async () => {
    const res = await run();
    expect(AgentService.run).toHaveBeenCalledWith(
      'do it',
      expect.anything(),
      'g1',
      'Do it',
      expect.anything(),
    );
    expect(res).toMatchObject({
      ok: true,
      stoppedReason: 'complete',
      completionOutcome: 'verified',
    });
    expect(String(res.runId)).toMatch(/^run-\d+$/);
    expect(setTrayAgentRunning).toHaveBeenCalledWith(true);
    expect(setTrayAgentRunning).toHaveBeenLastCalledWith(false);
    expect(bh.releaseAgentRun).toHaveBeenCalled();
    expect(runLock.unregisterRunControl).toHaveBeenCalled();
    expect(PlanGrantStore.revoke).toHaveBeenCalled();
    expect(shared.agentRunByGroup.has('g1')).toBe(false);
    expect(send).toHaveBeenLastCalledWith(IpcChannels.tokenUsage, expect.anything());
  });

  it('throws 429 at the pre-flight quota gate, still refunds and releases', async () => {
    getDb.mockReturnValue({ __db: true });
    PreferenceStore.getAll.mockReturnValue({ agentTokenQuota: 100, agentAutonomy: 'ask' });
    TokenStore.lifetimeTotals.mockReturnValue({ totalTokens: 200 });
    await expect(run()).rejects.toMatchObject({ statusCode: 429 });
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentEvent,
      expect.objectContaining({ kind: 'error' }),
    );
    expect(TokenStore.refundRun).toHaveBeenCalled();
    expect(shared.agentRunByGroup.has('g1')).toBe(false);
  });

  it('releases every claim when a setup step throws', async () => {
    getDb.mockReturnValue({ __db: true });
    AgentService.beginHistoryTurn.mockImplementation(() => {
      throw new Error('sqlite is sad');
    });
    await expect(run()).rejects.toThrow('sqlite is sad');
    expect(shared.agentRunByGroup.has('g1')).toBe(false);
    expect(setTrayAgentRunning).toHaveBeenLastCalledWith(false);
    expect(bh.releaseAgentRun).toHaveBeenCalled();
  });
});

describe('the injected hooks', () => {
  it('onEvent streams to the sender and raises a handoff notification', async () => {
    await run();
    hooksArg().onEvent('handoff', 'need a human', 'ctx');
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentEvent,
      expect.objectContaining({ kind: 'handoff', message: 'need a human', detail: 'ctx' }),
    );
    expect(NotificationHost.push).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'agent', title: 'Handoff', body: 'need a human' }),
    );
  });

  it('onModelDelta stamps first-feedback only on the first fragment and drops a schema failure', async () => {
    await run();
    const deltas = (): unknown[][] =>
      send.mock.calls.filter((c) => c[0] === IpcChannels.agentDelta);
    hooksArg().onModelDelta('hello');
    hooksArg().onModelDelta('world');
    expect(deltas()).toHaveLength(2);
    expect(deltas()[0]![1]).toMatchObject({ firstFeedbackMs: expect.any(Number) as number });
    expect(deltas()[1]![1]).not.toHaveProperty('firstFeedbackMs');

    AgentDeltaSchema.safeParse.mockReturnValue({ success: false });
    hooksArg().onModelDelta('dropped');
    expect(deltas()).toHaveLength(2);
  });
});
