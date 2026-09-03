import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const Logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({
  AppError,
  Logger: { redact: (s: string) => s, warn: Logger.warn, info: Logger.info },
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
const resolveAutonomy = vi.hoisted(() =>
  vi.fn<() => { decision: string; reason: string }>(() => ({ decision: 'ask', reason: 'r' })),
);
vi.mock('@tepegoz/security-policy', () => ({
  PlanGrantStore,
  REMEMBERED_GRANT_DAYS: 30,
  resolveAutonomy,
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
const planGrantScopeMock = vi.hoisted(() =>
  vi.fn<() => { urls: string[]; tiers: string[] }>(() => ({ urls: [], tiers: [] })),
);
vi.mock('../agent/plan-grant-scope', () => ({ planGrantScope: planGrantScopeMock }));
const remGrant = vi.hoisted(() => ({
  mayOfferRemember: vi.fn<() => boolean>(() => false),
  rememberGrant: vi.fn<() => unknown>(() => null),
  rememberedCoverage: vi.fn<() => { covered: boolean }>(() => ({ covered: false })),
  resolveSkillScope: vi.fn<() => unknown>(() => null),
}));
vi.mock('../agent/remembered-grant-scope', () => remGrant);
const runLock = vi.hoisted(() => ({
  createRunControl: vi.fn(() => ({ signal: { aborted: false } })),
  unregisterRunControl: vi.fn(),
}));
vi.mock('../agent/agent-run-lock.electron', () => runLock);
const fileOps = vi.hoisted(() => ({
  consentDecision: vi.fn<(req: unknown) => Promise<{ type: string; approved?: boolean }>>(() =>
    Promise.resolve({ type: 'auto', approved: true }),
  ),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fileOps }));

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
  isHistoryKind: vi.fn<(k: string) => boolean>(() => false),
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
  requestApproval: (req: unknown) => Promise<boolean>;
  requestPlanApproval: (plan: unknown) => Promise<{ approved: boolean }>;
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
  fileOps.consentDecision.mockResolvedValue({ type: 'auto', approved: true });
  remGrant.resolveSkillScope.mockReturnValue(null);
  remGrant.rememberedCoverage.mockReturnValue({ covered: false });
  remGrant.mayOfferRemember.mockReturnValue(false);
  remGrant.rememberGrant.mockReturnValue(null);
  resolveAutonomy.mockReturnValue({ decision: 'ask', reason: 'r' });
  PlanGrantStore.covers.mockReturnValue({ covered: false });
  PlanGrantStore.mint.mockReturnValue({ domains: [], tiers: [] });
  planGrantScopeMock.mockReturnValue({ urls: [], tiers: [] });
  bh.browserHost.listTabs.mockReturnValue([]);
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

describe('the injected requestApproval hook', () => {
  const confirmReq = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    toolName: 'fs.write',
    args: {},
    policy: { reason: 'writes a file', biometric: false },
    risk: { tier: 'low' },
    targetUrl: 'https://example.com/x',
    ...over,
  });

  it('short-circuits to the FileOperationsHost decision when it is an "auto" one', async () => {
    await run();
    expect(await hooksArg().requestApproval(confirmReq())).toBe(true);

    fileOps.consentDecision.mockResolvedValue({ type: 'auto', approved: false });
    expect(await hooksArg().requestApproval(confirmReq())).toBe(false);
    expect(send).not.toHaveBeenCalledWith(IpcChannels.agentApprovalRequest, expect.anything());
  });

  it('approves without a prompt when the approved plan grant already covers the step', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    PlanGrantStore.covers.mockReturnValue({ covered: true });
    await run();
    expect(await hooksArg().requestApproval(confirmReq())).toBe(true);
    expect(PlanGrantStore.covers).toHaveBeenCalledWith(
      expect.objectContaining({ targetUrl: 'https://example.com/x', tier: 'low' }),
    );
    expect(send).not.toHaveBeenCalledWith(IpcChannels.agentApprovalRequest, expect.anything());
  });

  it('approves on a remembered grant and narrates it into the transcript', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    remGrant.resolveSkillScope.mockReturnValue({ name: 'my-skill' });
    remGrant.rememberedCoverage.mockReturnValue({ covered: true });
    await run();
    expect(await hooksArg().requestApproval(confirmReq())).toBe(true);
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentEvent,
      expect.objectContaining({ kind: 'grant', detail: 'remembered_grant' }),
    );
  });

  it('approves without a prompt when the autonomy level auto-approves', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    resolveAutonomy.mockReturnValue({ decision: 'auto_approve', reason: 'autonomy: allow' });
    await run();
    expect(await hooksArg().requestApproval(confirmReq())).toBe(true);
    expect(send).not.toHaveBeenCalledWith(IpcChannels.agentApprovalRequest, expect.anything());
  });

  it('otherwise sends the HITL request and resolves with the renderer answer', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    await run();
    const pending = hooksArg().requestApproval(confirmReq());
    // requestApproval awaits the FileOperationsHost decision first, so let that microtask settle.
    await vi.waitFor(() => expect(shared.pendingApprovals.has('appr-uuid-x')).toBe(true));
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentApprovalRequest,
      expect.objectContaining({ approvalId: 'appr-uuid-x', toolName: 'fs.write' }),
    );
    const entry = shared.pendingApprovals.get('appr-uuid-x') as { resolve: (o: unknown) => void };
    entry.resolve({ approved: true });
    expect(await pending).toBe(true);
  });

  it('withholds the one-tap grant offer when the target URL will not parse', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    await run();
    const pending = hooksArg().requestApproval(confirmReq({ targetUrl: 'not a url' }));
    await vi.waitFor(() => expect(shared.pendingApprovals.has('appr-uuid-x')).toBe(true));
    const call = send.mock.calls.find((c) => c[0] === IpcChannels.agentApprovalRequest) as [
      string,
      Record<string, unknown>,
    ];
    expect(call[1]).not.toHaveProperty('scopeHost');
    const entry = shared.pendingApprovals.get('appr-uuid-x') as { resolve: (o: unknown) => void };
    entry.resolve({ approved: false });
    await pending;
  });

  it('fail-safe denies the HITL request when nobody answers within the timeout', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    await run();
    vi.useFakeTimers();
    try {
      const pending = hooksArg().requestApproval(confirmReq());
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await pending).toBe(false);
      expect(shared.pendingApprovals.has('appr-uuid-x')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips both grant checks and prompts with no grant offer for an unclassified call', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    await run();
    const pending = hooksArg().requestApproval(
      confirmReq({ risk: undefined, targetUrl: undefined }),
    );
    await vi.waitFor(() => expect(shared.pendingApprovals.has('appr-uuid-x')).toBe(true));
    expect(PlanGrantStore.covers).not.toHaveBeenCalled();
    expect(remGrant.rememberedCoverage).not.toHaveBeenCalled();
    const call = send.mock.calls.find((c) => c[0] === IpcChannels.agentApprovalRequest) as [
      string,
      Record<string, unknown>,
    ];
    expect(call[1]).not.toHaveProperty('riskTier');
    expect(call[1]).not.toHaveProperty('scopeHost');
    const entry = shared.pendingApprovals.get('appr-uuid-x') as { resolve: (o: unknown) => void };
    entry.resolve({ approved: false });
    expect(await pending).toBe(false);
  });

  it('widens the run scope and stores a remembered grant when the user ticks both boxes', async () => {
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    remGrant.resolveSkillScope.mockReturnValue({ name: 'sk' });
    remGrant.mayOfferRemember.mockReturnValue(true);
    remGrant.rememberGrant.mockReturnValue(Date.now() + 1000);
    await run();
    const pending = hooksArg().requestApproval(confirmReq());
    await vi.waitFor(() => expect(shared.pendingApprovals.has('appr-uuid-x')).toBe(true));
    const entry = shared.pendingApprovals.get('appr-uuid-x') as { resolve: (o: unknown) => void };
    entry.resolve({ approved: true, grantScope: true, remember: true });
    expect(await pending).toBe(true);
    expect(PlanGrantStore.grantFromApproval).toHaveBeenCalledWith(
      expect.stringMatching(/^run-\d+$/) as string,
      'https://example.com/x',
      'low',
    );
    expect(remGrant.rememberGrant).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentEvent,
      expect.objectContaining({ kind: 'grant', detail: 'remembered_grant' }),
    );
  });
});

describe('the injected requestPlanApproval hook', () => {
  const plan = { goal: 'buy milk', steps: [{ id: 's1', tool: 'nav', rationale: 'go' }] };

  it('mints a scoped grant and self-approves when autonomy is above "ask"', async () => {
    PreferenceStore.getAll.mockReturnValue({ agentTokenQuota: 0, agentAutonomy: 'allow' });
    await run();
    expect(await hooksArg().requestPlanApproval(plan)).toEqual({ approved: true });
    expect(PlanGrantStore.mint).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith(IpcChannels.agentPlanPreview, expect.anything());
  });

  it('sends a plan preview and mints the grant only once the renderer approves it', async () => {
    await run();
    const pending = hooksArg().requestPlanApproval(plan);
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentPlanPreview,
      expect.objectContaining({ planId: 'plan-uuid-x', goal: 'buy milk' }),
    );
    expect(PlanGrantStore.mint).not.toHaveBeenCalled();
    const entry = shared.pendingPlans.get('plan-uuid-x') as { resolve: (d: unknown) => void };
    entry.resolve({ approved: true });
    expect(await pending).toEqual({ approved: true });
    expect(PlanGrantStore.mint).toHaveBeenCalled();
  });

  it('does not mint a grant when the renderer rejects the plan', async () => {
    await run();
    const pending = hooksArg().requestPlanApproval(plan);
    const entry = shared.pendingPlans.get('plan-uuid-x') as { resolve: (d: unknown) => void };
    entry.resolve({ approved: false });
    expect(await pending).toEqual({ approved: false });
    expect(PlanGrantStore.mint).not.toHaveBeenCalled();
  });

  it('fail-safe rejects the plan when nobody answers within the timeout', async () => {
    await run();
    vi.useFakeTimers();
    try {
      const pending = hooksArg().requestPlanApproval(plan);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await pending).toEqual({ approved: false });
      expect(shared.pendingPlans.has('plan-uuid-x')).toBe(false);
      expect(PlanGrantStore.mint).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mints the grant scoped to the active tab URL when autonomy self-approves', async () => {
    PreferenceStore.getAll.mockReturnValue({ agentTokenQuota: 0, agentAutonomy: 'allow' });
    bh.browserHost.listTabs.mockReturnValue([
      { active: false, url: 'https://other.example' },
      { active: true, url: 'https://shop.example/cart' },
    ]);
    await run();
    await hooksArg().requestPlanApproval(plan);
    expect(planGrantScopeMock).toHaveBeenCalledWith(
      plan,
      'https://shop.example/cart',
      expect.any(Function),
    );
  });
});

describe('journal + history + token-ledger projections', () => {
  const journalTypes = shared.JOURNAL_TYPE_BY_KIND as Record<string, string>;
  afterEach(() => {
    shared.isHistoryKind.mockReturnValue(false);
    for (const k of Object.keys(journalTypes)) delete journalTypes[k];
  });

  it('onEvent writes to conversation history and the Event Journal when both are live', async () => {
    getDb.mockReturnValue({ __db: true });
    AgentService.beginHistoryTurn.mockReturnValue({ turnId: 'turn-1' });
    shared.isHistoryKind.mockReturnValue(true);
    journalTypes.tool_call = 'ToolCalled';
    await run();

    hooksArg().onEvent('tool_call', 'clicked #buy', 'on the cart page');

    expect(AgentService.appendHistoryEvent).toHaveBeenCalledWith(
      { __db: true },
      'turn-1',
      expect.objectContaining({
        kind: 'tool_call',
        message: 'clicked #buy',
        detail: 'on the cart page',
      }),
    );
    expect(shared.broadcastConversationsState).toHaveBeenCalled();
    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'ToolCalled', actor: 'agent', redacted: true }),
    );
  });

  it('onEvent swallows and logs a failing journal append', async () => {
    getDb.mockReturnValue({ __db: true });
    journalTypes.error = 'AgentError';
    EventJournal.append.mockImplementationOnce(() => {
      throw new Error('journal disk full');
    });
    await run();

    expect(() => hooksArg().onEvent('error', 'boom')).not.toThrow();
    expect(Logger.warn).toHaveBeenCalledWith(
      'Journal append failed',
      expect.objectContaining({ err: expect.stringContaining('journal disk full') as string }),
    );
  });

  it('onCheckpoint is a no-op when there is no database', async () => {
    getDb.mockReturnValue(null);
    await run();

    hooksArg().onCheckpoint({ step: 1 });

    expect(EventJournal.append).not.toHaveBeenCalled();
  });

  it('onCheckpoint appends a redacted CheckpointWritten record', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();

    hooksArg().onCheckpoint({ step: 3, note: 'halfway' });

    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'CheckpointWritten', actor: 'agent', redacted: true }),
    );
  });

  it('onCheckpoint falls back to the raw checkpoint when it cannot be stringified', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => hooksArg().onCheckpoint(circular)).not.toThrow();
    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'CheckpointWritten', payload: circular }),
    );
  });

  it('onCheckpoint swallows and logs a failing journal append', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockImplementationOnce(() => {
      throw new Error('checkpoint write failed');
    });

    expect(() => hooksArg().onCheckpoint({ step: 9 })).not.toThrow();
    expect(Logger.warn).toHaveBeenCalledWith(
      'Journal checkpoint append failed',
      expect.objectContaining({ err: expect.stringContaining('checkpoint write failed') as string }),
    );
  });

  it('refunds the run in teardown when it stopped for a refundable reason', async () => {
    getDb.mockReturnValue({ __db: true });
    AgentService.run.mockResolvedValue({
      ok: false,
      stoppedReason: 'network_lost',
      completionOutcome: 'verified',
    });

    await run();

    expect(TokenStore.recordRun).toHaveBeenCalled();
    expect(TokenStore.refundRun).toHaveBeenCalled();
  });

  it('logs, without failing the run, when the token-ledger persist throws', async () => {
    getDb.mockReturnValue({ __db: true });
    TokenStore.recordRun.mockImplementationOnce(() => {
      throw new Error('ledger unavailable');
    });

    await expect(run()).resolves.toMatchObject({ ok: true });
    expect(Logger.warn).toHaveBeenCalledWith(
      'Token ledger persist failed',
      expect.objectContaining({ err: expect.stringContaining('ledger unavailable') as string }),
    );
  });
});
