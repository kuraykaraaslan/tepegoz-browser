import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAgentControlIpc` — the run-control (cancel/pause/resume/steer) + HITL-response IPC surface.
 * Pinned: cancel aborts the run control AND fail-safe-denies every HITL promise still parked for that
 * run; pause/resume/steer route to the named control, emit a run event, and (pause/resume) append a
 * best-effort `CheckpointWritten` journal row that is skipped when there is no DB and swallowed when
 * the append throws; the approval/plan responses are relayed straight into the correlation registry.
 */

const helpers = vi.hoisted(() => ({
  actions: new Map<string, (payload: unknown) => void>(),
}));
vi.mock('./ipc-helpers', () => ({
  onAction: (c: string, _schema: unknown, fn: (payload: unknown) => void) =>
    helpers.actions.set(c, fn),
}));

vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: {
    agentCancel: 'agent:cancel',
    agentPause: 'agent:pause',
    agentResume: 'agent:resume',
    agentSteer: 'agent:steer',
    agentApprovalResponse: 'agent:approvalResponse',
    agentPlanResponse: 'agent:planResponse',
  },
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  AgentApprovalResponseSchema: { parse: (x: unknown) => x },
  AgentPlanResponseSchema: { parse: (x: unknown) => x },
  AgentRunIdSchema: { parse: (x: unknown) => x },
  AgentSteerSchema: { parse: (x: unknown) => x },
}));

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  redact: vi.fn((s: string) => s),
}));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const journal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));

vi.mock('@tepegoz/agent-runtime', () => ({
  holdCheckpoint: (reason: string) => ({ kind: 'hold', reason }),
  resumeCheckpoint: () => ({ kind: 'resume' }),
}));

const emitRunEvent = vi.hoisted(() => vi.fn());
vi.mock('../agent/browser-host.electron', () => ({ emitRunEvent }));

const runLock = vi.hoisted(() => ({
  agentRunControl: vi.fn((): { abort: () => void } | undefined => undefined),
  pauseAgentRun: vi.fn(),
  resumeAgentRun: vi.fn(),
  steerAgentRun: vi.fn(),
}));
vi.mock('../agent/agent-run-lock.electron', () => runLock);

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

// The correlation registry is Electron-free and unit-testable — use the real thing.
const { pendingApprovals, pendingPlans } = await import('../agent/hitl-registry');
const { registerAgentControlIpc } = await import('./ipc-agent-controls');

const fire = (channel: string, payload?: unknown): void => {
  const fn = helpers.actions.get(channel);
  if (fn === undefined) throw new Error(`no handler for ${channel}`);
  fn(payload);
};

beforeEach(() => {
  vi.clearAllMocks();
  helpers.actions.clear();
  pendingApprovals.clear();
  pendingPlans.clear();
  db.value = { __db: true };
  logger.redact.mockImplementation((s: string) => s);
  runLock.agentRunControl.mockReturnValue(undefined);
  registerAgentControlIpc();
});

describe('registration', () => {
  it('wires every run-control + HITL channel', () => {
    expect([...helpers.actions.keys()].sort()).toEqual(
      [
        'agent:approvalResponse',
        'agent:cancel',
        'agent:pause',
        'agent:planResponse',
        'agent:resume',
        'agent:steer',
      ].sort(),
    );
  });
});

describe('agentCancel', () => {
  it('aborts the run control when one is registered', () => {
    const abort = vi.fn();
    runLock.agentRunControl.mockReturnValue({ abort });
    fire('agent:cancel', 'run-1');
    expect(runLock.agentRunControl).toHaveBeenCalledWith('run-1');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('is a no-op abort when the run is already gone', () => {
    expect(() => {
      fire('agent:cancel', 'ghost');
    }).not.toThrow();
  });

  it('fail-safe-denies only the approvals + plans parked for THIS run', () => {
    const mineA = vi.fn();
    const mineP = vi.fn();
    const otherA = vi.fn();
    pendingApprovals.set('appr-mine', { runId: 'run-1', resolve: mineA });
    pendingApprovals.set('appr-other', { runId: 'run-2', resolve: otherA });
    pendingPlans.set('plan-mine', { runId: 'run-1', resolve: mineP });

    fire('agent:cancel', 'run-1');

    expect(mineA).toHaveBeenCalledWith({ approved: false, remember: false, grantScope: false });
    expect(mineP).toHaveBeenCalledWith({ approved: false });
    expect(otherA).not.toHaveBeenCalled();
    expect(pendingApprovals.has('appr-mine')).toBe(false);
    expect(pendingPlans.has('plan-mine')).toBe(false);
    expect(pendingApprovals.has('appr-other')).toBe(true);
  });
});

describe('pause / resume / steer', () => {
  it('pause holds the run, emits the event, and journals a hold checkpoint', () => {
    fire('agent:pause', 'run-1');
    expect(runLock.pauseAgentRun).toHaveBeenCalledWith('run-1');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'paused', 'paused');
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'CheckpointWritten',
        actor: 'agent',
        correlationId: 'run-1',
        redacted: true,
        payload: { kind: 'hold', reason: 'user' },
      }) as object,
    );
  });

  it('resume releases the run, emits the event, and journals a resume checkpoint', () => {
    fire('agent:resume', 'run-1');
    expect(runLock.resumeAgentRun).toHaveBeenCalledWith('run-1');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'resumed', 'resumed');
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ payload: { kind: 'resume' } }) as object,
    );
  });

  it('steer injects the text and emits it as the event detail', () => {
    fire('agent:steer', { runId: 'run-1', text: 'try the other link' });
    expect(runLock.steerAgentRun).toHaveBeenCalledWith('run-1', 'try the other link');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'steered', 'try the other link');
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('skips the journal append entirely when there is no DB', () => {
    db.value = null;
    fire('agent:pause', 'run-1');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'paused', 'paused');
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('falls back to the raw checkpoint when redaction throws, and still appends', () => {
    logger.redact.mockImplementation(() => {
      throw new Error('redactor down');
    });
    fire('agent:pause', 'run-1');
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ payload: { kind: 'hold', reason: 'user' } }) as object,
    );
  });

  it('swallows a throwing journal append and logs it — pause still emits', () => {
    journal.append.mockImplementation(() => {
      throw new Error('journal offline');
    });
    expect(() => {
      fire('agent:resume', 'run-1');
    }).not.toThrow();
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'resumed', 'resumed');
    expect(logger.warn).toHaveBeenCalledWith(
      'Journal hold/resume checkpoint append failed',
      expect.objectContaining({
        err: expect.stringContaining('journal offline') as string,
      }) as object,
    );
  });
});

describe('HITL responses', () => {
  it('relays an approval response into the registry, defaulting the optional flags', () => {
    const resolve = vi.fn();
    pendingApprovals.set('appr-1', { runId: 'run-1', resolve });
    fire('agent:approvalResponse', { approvalId: 'appr-1', approved: true });
    expect(resolve).toHaveBeenCalledWith({ approved: true, remember: false, grantScope: false });
  });

  it('passes remember + grantScope through when the renderer set them', () => {
    const resolve = vi.fn();
    pendingApprovals.set('appr-2', { runId: 'run-1', resolve });
    fire('agent:approvalResponse', {
      approvalId: 'appr-2',
      approved: true,
      remember: true,
      grantScope: true,
    });
    expect(resolve).toHaveBeenCalledWith({ approved: true, remember: true, grantScope: true });
  });

  it('logs and drops an approval response that correlates to nothing', () => {
    fire('agent:approvalResponse', { approvalId: 'nope', approved: true });
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected approval response for an unknown or already-settled request',
      expect.objectContaining({ approvalId: 'nope' }) as object,
    );
  });

  it('relays a plan response, forwarding the skipped step ids', () => {
    const resolve = vi.fn();
    pendingPlans.set('plan-1', { runId: 'run-1', resolve });
    fire('agent:planResponse', { planId: 'plan-1', approved: true, skipStepIds: ['s2'] });
    expect(resolve).toHaveBeenCalledWith({ approved: true, skipStepIds: ['s2'] });
  });
});
