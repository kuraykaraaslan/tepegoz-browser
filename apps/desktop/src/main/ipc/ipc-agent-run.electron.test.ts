import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAgentRunIpc` — the `agent:run` handler that streams live events + round-trips HITL
 * approvals. Pinned: it refuses when the agent extension is disabled and 409s a second run for a
 * group already running; a real run claims the per-group lock + tray indicator, runs through
 * `AgentService.run`, maps the summary (with a validated completion outcome) and ALWAYS releases every
 * claim in `finally`; the pre-flight token-quota gate throws 429 (and still refunds + releases); the
 * injected `onEvent` streams to the sender and raises a handoff notification; `onModelDelta` streams a
 * schema-checked fragment with a first-feedback stamp only on the first; and a throwing setup step
 * releases every claim before rethrowing. The HITL gates and the journal projections have their own
 * suites (`ipc-agent-run-approvals`, `ipc-agent-run-events`), which share `ipc-agent-run.test-kit`.
 */

const h = await vi.hoisted(async () =>
  (await import('./ipc-agent-run.test-kit')).createRunHarness(),
);
vi.mock('@tepegoz/libs', () => ({
  AppError: h.AppError,
  Logger: { redact: (s: string) => s, warn: h.Logger.warn, info: h.Logger.info },
}));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: h.IpcChannels }));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({ AgentRunInputSchema: { safeParse: vi.fn() } }));
vi.mock('@tepegoz/shared-types', () => ({
  AgentDeltaSchema: h.AgentDeltaSchema,
  CompletionOutcomeSchema: h.CompletionOutcomeSchema,
  CompletionEvidenceSchema: h.CompletionEvidenceSchema,
  MAX_DELTA_TEXT: 2000,
  // The real, small, stable constant — not an empty stub — so a test can actually exercise "this tier
  // is one of the ones that always prompts" without also having to fake the constant's own contents.
  NEVER_AUTO_GRANTABLE_TIERS: ['financial', 'credential', 'destructive'] as string[],
}));
vi.mock('@tepegoz/security-policy', () => ({
  PlanGrantStore: h.PlanGrantStore,
  REMEMBERED_GRANT_DAYS: 30,
  resolveAutonomy: h.resolveAutonomy,
  classifyRisk: h.classifyRisk,
}));
vi.mock('@tepegoz/capability-plane', () => ({ CapabilityRegistry: h.capabilityRegistry }));
vi.mock('@tepegoz/model-gateway', () => ({
  TokenLedger: { runScoped: (fn: () => unknown) => fn(), snapshotEntries: vi.fn(() => []) },
}));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: h.EventJournal, TokenStore: h.TokenStore }));

// randomUUID is stubbed for deterministic ids; createHash is kept real — appendChainedEvent's
// selfHashOf (unmocked, see below) needs it, same as ipc-agent-run-report.electron.test.ts's choice
// not to mock @tepegoz/notary.
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID: () => 'uuid-x',
}));

vi.mock('../agent/agent-service.electron', () => ({ default: h.AgentService }));
vi.mock('../agent/browser-host.electron', () => h.bh);
vi.mock('../agent/run-resource-tracker.electron', () => h.resourceTracker);
vi.mock('../tabs', () => ({
  default: { getState: vi.fn(() => ({ tabs: [] as unknown[], activeId: null })) },
}));
vi.mock('../agent/plan-grant-scope', () => ({ planGrantScope: h.planGrantScopeMock }));
vi.mock('../agent/remembered-grant-scope', () => h.remGrant);
vi.mock('../agent/agent-run-lock.electron', () => h.runLock);
vi.mock('../file-operations/file-operations-host', () => ({ default: h.fileOps }));
vi.mock('../db/database.electron', () => ({ getDb: h.getDb }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    agent: {
      handoff: { notifyTitle: 'Handoff' },
      notifications: { approvalNeededTitle: 'Approval needed' },
      grants: { remembered: 'remembered {skill}', used: 'used {skill}' },
    },
  }),
}));
vi.mock('../tray', () => ({ setTrayAgentRunning: h.setTrayAgentRunning }));
vi.mock('../notifications/notification-host', () => ({ default: h.NotificationHost }));
vi.mock('@tepegoz/preferences', () => ({ default: h.PreferenceStore }));
vi.mock('./ipc-helpers', () => h.helpers);
vi.mock('./ipc-agent-shared', () => h.shared);

const { registerAgentRunIpc } = await import('./ipc-agent-run');

const {
  AppError,
  Logger,
  IpcChannels,
  AgentDeltaSchema,
  CompletionEvidenceSchema,
  PlanGrantStore,
  TokenStore,
  AgentService,
  bh,
  resourceTracker,
  runLock,
  getDb,
  setTrayAgentRunning,
  NotificationHost,
  PreferenceStore,
  shared,
  hooksArg,
  run,
} = h;
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.reset();
  send = h.driver.send;
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

  it('carries the evidence behind the completion outcome, validated at the boundary (S8 PR2)', async () => {
    const evidence = {
      mutating: true,
      items: [{ id: 'a', kind: 'network', verdict: 'contradicts', detail: '5xx after Save' }],
    };
    AgentService.run.mockResolvedValueOnce({
      ok: true,
      stoppedReason: 'complete',
      completionOutcome: 'contradicted',
      evidence,
    });
    const res = await run();
    expect(res).toMatchObject({ completionOutcome: 'contradicted', evidence });
  });

  it('drops evidence that fails validation rather than forwarding it unchecked', async () => {
    CompletionEvidenceSchema.safeParse.mockReturnValueOnce({ success: false });
    AgentService.run.mockResolvedValueOnce({
      ok: true,
      stoppedReason: 'complete',
      completionOutcome: 'verified',
      evidence: { not: 'valid' },
    });
    const res = await run();
    expect(res.completionOutcome).toBe('verified');
    expect(res).not.toHaveProperty('evidence');
  });

  it('tracks resource usage across the run and folds it into the token-usage push', async () => {
    await run();
    expect(resourceTracker.startRunResourceTracking).toHaveBeenCalledTimes(1);
    hooksArg().onEvent('step_start', 'step 1');
    hooksArg().onEvent('step_ok', 'clicked');
    expect(resourceTracker.sampleRunResource).toHaveBeenCalledTimes(2);
    expect(resourceTracker.sampleRunResource).toHaveBeenCalledWith({ __tracker: true });
    expect(resourceTracker.finishRunResourceTracking).toHaveBeenCalledWith({ __tracker: true });
    expect(shared.tokenUsage).toHaveBeenCalledWith({ peakRssBytes: 123, cpuSeconds: 4.5 });
  });

  it('does not sample on a non-step event (e.g. an input_action)', async () => {
    await run();
    resourceTracker.sampleRunResource.mockClear();
    hooksArg().onEvent('grant', 'used a remembered grant');
    expect(resourceTracker.sampleRunResource).not.toHaveBeenCalled();
  });

  it('still sends a token-usage push (without a resource fields crash) when the resource finish throws', async () => {
    resourceTracker.finishRunResourceTracking.mockImplementationOnce(() => {
      throw new Error('resourceUsage unavailable');
    });
    await run();
    expect(Logger.warn).toHaveBeenCalledWith(
      'Run resource finish failed',
      expect.objectContaining({
        err: expect.stringContaining('resourceUsage unavailable') as string,
      }),
    );
    expect(shared.tokenUsage).toHaveBeenLastCalledWith(undefined);
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

describe('token-ledger teardown', () => {
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
