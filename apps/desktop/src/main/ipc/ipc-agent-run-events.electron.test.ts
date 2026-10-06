import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENESIS_HASH } from '@tepegoz/notary';

/**
 * `agent:run` event plumbing (`ipc-agent-run-events.ts`) and audit journal — the journal, history and
 * token-ledger projections of a run. Pinned: `onEvent` writes conversation history and a CHAINED, redacted
 * Event Journal record (swallowing a failing append); `onCheckpoint` appends a redacted checkpoint (no-op
 * without a database, never throws); `onAudit` journals only resolved verdicts, attaches the standing
 * permission that answered an ask exactly once, and swallows a failing append.
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
  Logger,
  PlanGrantStore,
  EventJournal,
  AgentService,
  fileOps,
  getDb,
  shared,
  hooksArg,
  run,
} = h;
beforeEach(() => {
  h.reset();
  registerAgentRunIpc();
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

  it('onEvent chains the journal append off EventJournal.tailHash (Phase 7) — genesis first, then the prior selfHash', async () => {
    getDb.mockReturnValue({ __db: true });
    journalTypes.step_ok = 'AgentStepExecuted';
    await run();

    EventJournal.tailHash.mockReturnValueOnce(null); // nothing chained yet on this device
    hooksArg().onEvent('step_ok', 'first step');
    const firstCall = EventJournal.append.mock.calls[0]![1] as {
      prevHash: string;
      selfHash: string;
    };
    expect(firstCall.prevHash).toBe(GENESIS_HASH);
    expect(firstCall.selfHash).toMatch(/^[a-f0-9]{64}$/);

    EventJournal.tailHash.mockReturnValueOnce(firstCall.selfHash); // chains onto its own prior tail
    hooksArg().onEvent('step_ok', 'second step');
    const secondCall = EventJournal.append.mock.calls[1]![1] as {
      prevHash: string;
      selfHash: string;
    };
    expect(secondCall.prevHash).toBe(firstCall.selfHash);
    expect(secondCall.selfHash).not.toBe(firstCall.selfHash);
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

  it('onCheckpoint safely logs (never throws out of the run) when the checkpoint cannot be chained at all', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => hooksArg().onCheckpoint(circular)).not.toThrow();
    expect(EventJournal.append).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(
      'Journal checkpoint append failed',
      expect.any(Object),
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
      expect.objectContaining({
        err: expect.stringContaining('checkpoint write failed') as string,
      }),
    );
  });

  it('onAudit skips a pre-resolution `ask` (no outcome yet) — nothing is journaled', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();

    hooksArg().onAudit({
      toolName: 'form_update_field',
      decision: 'ask',
      reason: 'state_change_confirm',
    });

    expect(EventJournal.append).not.toHaveBeenCalled();
  });

  it('onAudit journals an unconditional allow as ToolInvoked, carrying the target site', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();

    hooksArg().onAudit({
      toolName: 'browser_get_page',
      decision: 'allow',
      reason: 'read_allowed',
      targetUrl: 'https://a.example/page',
    });

    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'ToolInvoked',
        actor: 'agent',
        redacted: true,
        payload: expect.objectContaining({
          toolName: 'browser_get_page',
          targetUrl: 'https://a.example/page',
          reason: 'read_allowed',
          decision: 'allow',
        }) as unknown,
      }),
    );
  });

  it('onAudit journals an outright deny as PolicyBlocked', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();

    hooksArg().onAudit({
      toolName: 'file_delete_item',
      decision: 'deny',
      reason: 'sensitive_site_lockout',
    });

    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'PolicyBlocked',
        payload: expect.objectContaining({ decision: 'deny' }) as unknown,
      }),
    );
  });

  it('onAudit journals a resolved `ask` as PolicyBlocked when refused, ToolInvoked when approved', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockClear();

    hooksArg().onAudit({
      toolName: 'form_update_field',
      decision: 'ask',
      reason: 'state_change_confirm',
      outcome: 'refused',
    });
    expect(EventJournal.append).toHaveBeenLastCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'PolicyBlocked' }),
    );

    hooksArg().onAudit({
      toolName: 'form_update_field',
      decision: 'ask',
      reason: 'state_change_confirm',
      outcome: 'approved',
    });
    expect(EventJournal.append).toHaveBeenLastCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'ToolInvoked' }),
    );
  });

  it('onAudit attaches WHICH standing permission answered an ask, then clears it for the next call', async () => {
    getDb.mockReturnValue({ __db: true });
    fileOps.consentDecision.mockResolvedValue({ type: 'ask' });
    PlanGrantStore.covers.mockReturnValue({ covered: true });
    await run();
    EventJournal.append.mockClear();

    // The plan-grant coverage check happens in requestApproval; onAudit's SECOND (post-resolution)
    // call is what the gateway fires right after requestApproval resolves — same sequence as
    // ToolGateway.invoke's real ordering.
    await hooksArg().requestApproval({
      toolName: 'form_update_field',
      args: {},
      policy: { reason: 'state_change_confirm', biometric: false, decision: 'ask' },
      risk: { tier: 'ui-write' },
      targetUrl: 'https://a.example',
    });
    hooksArg().onAudit({
      toolName: 'form_update_field',
      decision: 'ask',
      reason: 'state_change_confirm',
      outcome: 'approved',
    });
    expect(EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        payload: expect.objectContaining({ rememberedBy: 'plan_grant' }) as unknown,
      }),
    );

    // A SECOND, unrelated decision must not inherit the hint — it was consumed by the call above.
    EventJournal.append.mockClear();
    hooksArg().onAudit({
      toolName: 'browser_get_page',
      decision: 'allow',
      reason: 'read_allowed',
    });
    const [, payload] = EventJournal.append.mock.calls[0] as [unknown, { payload: object }];
    expect(payload.payload).not.toHaveProperty('rememberedBy');
  });

  it('onAudit swallows and logs a failing journal append', async () => {
    getDb.mockReturnValue({ __db: true });
    await run();
    EventJournal.append.mockImplementationOnce(() => {
      throw new Error('journal disk full');
    });

    expect(() =>
      hooksArg().onAudit({ toolName: 'x', decision: 'allow', reason: 'read_allowed' }),
    ).not.toThrow();
    expect(Logger.warn).toHaveBeenCalledWith(
      'Permission Debug journal append failed',
      expect.objectContaining({ err: expect.stringContaining('journal disk full') as string }),
    );
  });
});
