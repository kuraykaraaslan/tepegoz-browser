import { vi } from 'vitest';

/**
 * Shared test kit for the `agent:run` handler suites (`ipc-agent-run*.electron.test.ts`).
 *
 * The handler wires ~25 collaborators, so every suite that drives it through `registerAgentRunIpc` needs
 * the same fakes. They live here once instead of being pasted into each spec. This module is test-only
 * (it imports `vitest`) and is loaded by the specs through `vi.hoisted`, so the fakes exist before the
 * `vi.mock(...)` factories in each spec — which stay in the specs, because `vi.mock` is hoisted per file.
 */

export class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}

export type Hooks = {
  onEvent: (k: string, m: string, d?: string) => void;
  onModelDelta: (t: string) => void;
  onCheckpoint: (c: unknown) => void;
  onAudit: (e: {
    toolName: string;
    decision: 'allow' | 'ask' | 'deny';
    reason: string;
    riskTier?: string;
    targetUrl?: string;
    outcome?: 'approved' | 'refused';
  }) => void;
  requestApproval: (req: unknown) => Promise<boolean>;
  requestPlanApproval: (plan: unknown) => Promise<{ approved: boolean }>;
};

export function createRunHarness() {
  const Logger = { warn: vi.fn(), info: vi.fn() };

  const IpcChannels = {
    agentRun: 'agent:run',
    agentEvent: 'agent:event',
    agentDelta: 'agent:delta',
    agentApprovalRequest: 'agent:approval-request',
    agentPlanPreview: 'agent:plan-preview',
    tokenUsage: 'token:usage',
  };

  const AgentDeltaSchema = {
    safeParse: vi.fn<(v: unknown) => { success: boolean; data?: unknown }>((v: unknown) => ({
      success: true,
      data: v,
    })),
  };
  const CompletionOutcomeSchema = {
    safeParse: vi.fn((v: unknown) =>
      v !== undefined ? { success: true as const, data: v } : { success: false as const },
    ),
  };
  const CompletionEvidenceSchema = {
    safeParse: vi.fn((v: unknown) =>
      v !== undefined ? { success: true as const, data: v } : { success: false as const },
    ),
  };

  const PlanGrantStore = {
    revoke: vi.fn(),
    covers: vi.fn(() => ({ covered: false })),
    mint: vi.fn(() => ({ domains: [], tiers: [] })),
    grantFromApproval: vi.fn(() => ({ domains: [], tiers: [] })),
  };
  const resolveAutonomy = vi.fn<() => { decision: string; reason: string }>(() => ({
    decision: 'ask',
    reason: 'r',
  }));
  const classifyRisk = vi.fn<() => { tier: string; reasons: string[] }>(() => ({
    tier: 'read',
    reasons: [],
  }));
  const capabilityRegistry = {
    get: vi.fn((): { descriptor: { dangerClass?: string } } | undefined => undefined),
  };

  const TokenStore = {
    lifetimeTotals: vi.fn(() => ({ totalTokens: 0 })),
    recordRun: vi.fn(),
    refundRun: vi.fn(),
  };
  const EventJournal = {
    append: vi.fn(),
    tailHash: vi.fn((): string | null => null),
  };

  const AgentService = {
    run: vi.fn<
      (p: string, h: unknown, g: string, dp: string, b: unknown) => Promise<Record<string, unknown>>
    >(() =>
      Promise.resolve({ ok: true, stoppedReason: 'complete', completionOutcome: 'verified' }),
    ),
    beginHistoryTurn: vi.fn((): unknown => null),
    appendHistoryEvent: vi.fn(),
  };

  const bh = {
    browserHost: { listTabs: vi.fn(() => [] as { active?: boolean; url?: string }[]) },
    releaseAgentRun: vi.fn(),
    setCurrentAgentRun: vi.fn(),
    withAgentRunScope: (_id: string, fn: () => unknown) => fn(),
  };

  const resourceTracker = {
    startRunResourceTracking: vi.fn(() => ({ __tracker: true })),
    sampleRunResource: vi.fn(),
    finishRunResourceTracking: vi.fn(() => ({ peakRssBytes: 123, cpuSeconds: 4.5 })),
  };

  const planGrantScopeMock = vi.fn<() => { urls: string[]; tiers: string[] }>(() => ({
    urls: [],
    tiers: [],
  }));
  const remGrant = {
    mayOfferRemember: vi.fn<() => boolean>(() => false),
    rememberGrant: vi.fn<() => unknown>(() => null),
    rememberedCoverage: vi.fn<() => { covered: boolean }>(() => ({ covered: false })),
    resolveSkillScope: vi.fn<() => unknown>(() => null),
  };
  const runLock = {
    createRunControl: vi.fn(() => ({ signal: { aborted: false } })),
    unregisterRunControl: vi.fn(),
  };
  const fileOps = {
    consentDecision: vi.fn<(req: unknown) => Promise<{ type: string; approved?: boolean }>>(() =>
      Promise.resolve({ type: 'auto', approved: true }),
    ),
  };

  const getDb = vi.fn((): unknown => null);
  const setTrayAgentRunning = vi.fn();
  const NotificationHost = { push: vi.fn() };
  const PreferenceStore = {
    getAll: vi.fn(() => ({ agentTokenQuota: 0, agentAutonomy: 'ask' })),
  };

  const cap: { fn?: (e: unknown, p: unknown) => Promise<Record<string, unknown>> } = {};
  const helpers = {
    handle: vi.fn(),
    handleAsync: vi.fn(
      (_ch: string, fn: (e: unknown, p: unknown) => Promise<Record<string, unknown>>) => {
        cap.fn = fn;
      },
    ),
    parsePayload: vi.fn((_s: unknown, p: unknown) => p),
  };

  const shared = {
    activeAgentGroups: vi.fn(() => [] as string[]),
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
    setAgentRunForGroup: vi.fn((groupId: string, running: boolean) => {
      if (running) shared.agentRunByGroup.set(groupId, true);
      else shared.agentRunByGroup.delete(groupId);
    }),
    tokenUsage: vi.fn(() => ({})),
  };

  /** The per-run sender the handler streams to; replaced on every {@link reset}. */
  const driver: {
    send: ReturnType<typeof vi.fn>;
    event: { sender: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } };
  } = {
    send: vi.fn(),
    event: { sender: { isDestroyed: () => false, send: vi.fn() } },
  };

  /** The hooks `AgentService.run` was handed on the first call (what a real run would inject). */
  const hooksArg = (): Hooks => AgentService.run.mock.calls[0]![1] as Hooks;

  /** Invoke the captured `agent:run` handler as the renderer would. */
  const run = (over: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    cap.fn!(driver.event, {
      prompt: 'do it',
      groupId: 'g1',
      displayPrompt: 'Do it',
      attachmentMeta: [],
      ...over,
    });

  /** The shared `beforeEach` body: clear every fake back to its default, ahead of `registerAgentRunIpc()`. */
  const reset = (): void => {
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
    resourceTracker.startRunResourceTracking.mockReturnValue({ __tracker: true });
    resourceTracker.finishRunResourceTracking.mockReturnValue({
      peakRssBytes: 123,
      cpuSeconds: 4.5,
    });
    driver.send = vi.fn();
    driver.event = { sender: { isDestroyed: () => false, send: driver.send } };
  };

  return {
    AppError,
    Logger,
    IpcChannels,
    AgentDeltaSchema,
    CompletionOutcomeSchema,
    CompletionEvidenceSchema,
    PlanGrantStore,
    resolveAutonomy,
    classifyRisk,
    capabilityRegistry,
    TokenStore,
    EventJournal,
    AgentService,
    bh,
    resourceTracker,
    planGrantScopeMock,
    remGrant,
    runLock,
    fileOps,
    getDb,
    setTrayAgentRunning,
    NotificationHost,
    PreferenceStore,
    helpers,
    shared,
    driver,
    hooksArg,
    run,
    reset,
  };
}
