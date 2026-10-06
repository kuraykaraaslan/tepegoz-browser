import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `agent:run` HITL gates (`ipc-agent-run-approvals.ts`) — the `requestApproval` and `requestPlanApproval`
 * hooks the handler injects into `AgentService.run`. Pinned: an "auto" FileOperationsHost decision, an
 * approved plan grant, a remembered grant and an auto-approving autonomy level each resolve WITHOUT a
 * prompt; otherwise the HITL request goes to the renderer (UUID-keyed, fail-safe denied after 120s), the
 * one-tap and remember grants are offered only when main would honour them, and plan approval previews
 * the plan, mints its scoped grant only on approval, and never counts unresolved tools.
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
  IpcChannels,
  PlanGrantStore,
  resolveAutonomy,
  classifyRisk,
  capabilityRegistry,
  bh,
  planGrantScopeMock,
  remGrant,
  fileOps,
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

  it('includes each step’s DECLARED dangerClass from the CapabilityRegistry, omitting it for an unrecognized tool', async () => {
    await run();
    const twoStepPlan = {
      goal: 'buy milk',
      steps: [
        { id: 's1', tool: 'nav', rationale: 'go' },
        { id: 's2', tool: 'unregistered_tool', rationale: 'unknown to this build' },
      ],
    };
    // Queued in step order: requestPlanApproval maps the steps in sequence, one .get() call each.
    capabilityRegistry.get.mockImplementationOnce(() => ({
      descriptor: { dangerClass: 'destructive' },
    }));
    capabilityRegistry.get.mockImplementationOnce(() => undefined);
    void hooksArg().requestPlanApproval(twoStepPlan);
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentPlanPreview,
      expect.objectContaining({
        steps: [
          { id: 's1', tool: 'nav', rationale: 'go', dangerClass: 'destructive' },
          { id: 's2', tool: 'unregistered_tool', rationale: 'unknown to this build' },
        ],
      }),
    );
  });

  it('counts guaranteedApprovals as the steps whose classified tier is never-auto-grantable', async () => {
    await run();
    const threeStepPlan = {
      goal: 'x',
      steps: [
        { id: 's1', tool: 'files_delete_item', rationale: 'a', args: {} },
        { id: 's2', tool: 'nav', rationale: 'b', args: {} },
        { id: 's3', tool: 'payments_send_money', rationale: 'c', args: {} },
      ],
    };
    // mockReturnValueOnce ×3, not a persistent mockReturnValue — this must not leak into later tests.
    capabilityRegistry.get
      .mockReturnValueOnce({ descriptor: { dangerClass: 'destructive' } })
      .mockReturnValueOnce({ descriptor: { dangerClass: 'read' } })
      .mockReturnValueOnce({ descriptor: { dangerClass: 'financial' } });
    classifyRisk
      .mockReturnValueOnce({ tier: 'destructive', reasons: [] }) // s1 — counts
      .mockReturnValueOnce({ tier: 'ui-write', reasons: [] }) // s2 — does not
      .mockReturnValueOnce({ tier: 'financial', reasons: [] }); // s3 — counts
    void hooksArg().requestPlanApproval(threeStepPlan);
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentPlanPreview,
      expect.objectContaining({ guaranteedApprovals: 2 }),
    );
  });

  it('never counts a step whose tool did not resolve — unknown contributes nothing, same as its dangerClass', async () => {
    await run();
    capabilityRegistry.get.mockReturnValueOnce(undefined);
    void hooksArg().requestPlanApproval(plan);
    expect(classifyRisk).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentPlanPreview,
      expect.objectContaining({ guaranteedApprovals: 0 }),
    );
  });

  it('sends deduped hostnames from planGrantScope’s URLs as "sites", dropping anything unparseable', async () => {
    await run();
    planGrantScopeMock.mockReturnValueOnce({
      urls: [
        'https://a.example/cart',
        'https://a.example/checkout',
        'https://b.example/',
        'not-a-url',
      ],
      tiers: [],
    });
    void hooksArg().requestPlanApproval(plan);
    expect(send).toHaveBeenCalledWith(
      IpcChannels.agentPlanPreview,
      expect.objectContaining({ sites: ['a.example', 'b.example'] }),
    );
  });

  it('derives the plan-scope entry URL from the active tab, the same input mintPlanGrant uses', async () => {
    await run();
    bh.browserHost.listTabs.mockReturnValue([
      { active: false, url: 'https://inactive.example' },
      { active: true, url: 'https://active.example/page' },
    ]);
    void hooksArg().requestPlanApproval(plan);
    expect(planGrantScopeMock).toHaveBeenCalledWith(
      plan,
      'https://active.example/page',
      expect.any(Function),
    );
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
