import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `runTaskAgent` — the unattended background-task agent launcher. Pinned: it refuses when the agent
 * extension is disabled or the task's group is already running; on a real run it latches the group,
 * registers a headless working-tab scope, builds the prompt with the saved task context, runs through
 * `AgentService.run`, and ALWAYS releases the latch / controller / headless scope in `finally`; the
 * result maps `summary.ok` → summary vs `stoppedReason` error; a thrown AppError / Error becomes an
 * error result; and the injected hooks journal step events + fire handoff / approval notifications,
 * with `requestApproval` auto-approving only when the task policy pre-approves the tool + origin.
 */

class AppError extends Error {}
const logger = vi.hoisted(() => ({ warn: vi.fn(), redact: (s: string) => `[${s}]` }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));
vi.mock('@tepegoz/ext-agent/manifest', () => ({ agentManifest: { id: 'ext-agent' } }));

const taskCanUseTool = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/tasks', () => ({ taskCanUseTool }));

const journal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ extensions: [{ id: 'ext-agent' }] }) },
}));
vi.mock('@tepegoz/model-gateway', () => ({
  TokenLedger: { runScoped: (fn: () => unknown) => fn() },
}));

const agentRun = vi.hoisted(() =>
  vi.fn<(prompt: string, hooks: unknown, groupId: string) => Promise<unknown>>(() =>
    Promise.resolve({ ok: true, summary: 'the result', stoppedReason: 'complete' }),
  ),
);
vi.mock('./agent-service.electron', () => ({ default: { run: agentRun } }));

const notify = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../notifications/notification-host', () => ({ default: notify }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    agent: { notifications: { taskHandoffTitle: 'Handoff', taskApprovalTitle: 'Approval' } },
  }),
}));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const lock = vi.hoisted(() => ({
  registerAgentRunController: vi.fn(),
  unregisterAgentRunController: vi.fn(),
}));
vi.mock('./agent-run-lock.electron', () => lock);

const bh = vi.hoisted(() => ({
  registerHeadlessRun: vi.fn(),
  releaseAgentRun: vi.fn(),
  withAgentRunScope: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock('./browser-host.electron', () => bh);

const agentRunByGroup = vi.hoisted(() => new Map<string, boolean>());
vi.mock('../ipc/ipc-agent-shared', () => ({ agentRunByGroup }));

const { runTaskAgent } = await import('./task-agent-runner.electron');

const task = (over: Record<string, unknown> = {}) =>
  ({
    id: 'task-99',
    prompt: 'do the report',
    targetUrl: 'https://site.test/page',
    policy: { reason: 'x', allowedOrigins: ['https://site.test'] },
    ...over,
  }) as never;
const run = { correlationId: 'corr-1' } as never;
const trigger = { type: 'interval' } as never;

/** Grab the hooks object handed to AgentService.run. */
type Hooks = {
  onEvent: (k: string, m: string, d?: string) => void;
  onCheckpoint: (c: unknown) => void;
  requestApproval: (r: unknown) => Promise<boolean>;
};
const hooks = () => agentRun.mock.calls[0]![1] as Hooks;

beforeEach(() => {
  vi.clearAllMocks();
  agentRunByGroup.clear();
  db.value = { __db: true };
  isExtensionEnabled.mockReturnValue(true);
  taskCanUseTool.mockReturnValue(true);
  agentRun.mockResolvedValue({ ok: true, summary: 'the result', stoppedReason: 'complete' });
});

describe('the refusal paths', () => {
  it('refuses when the agent extension is disabled', async () => {
    isExtensionEnabled.mockReturnValue(false);
    expect(await runTaskAgent(task(), run, trigger)).toEqual({
      ok: false,
      error: 'Agent extension is disabled',
    });
    expect(lock.registerAgentRunController).not.toHaveBeenCalled();
  });

  it('refuses (and unregisters) when the task group is already running', async () => {
    agentRunByGroup.set('task-task-99', true);
    expect(await runTaskAgent(task(), run, trigger)).toEqual({
      ok: false,
      error: 'This task is already running',
    });
    expect(lock.unregisterAgentRunController).toHaveBeenCalledWith('corr-1');
  });
});

describe('a real run', () => {
  it('latches the group, registers a headless scope, runs with the task-context prompt, and cleans up', async () => {
    const res = await runTaskAgent(task(), run, trigger);
    expect(lock.registerAgentRunController).toHaveBeenCalledWith('corr-1', expect.anything());
    expect(bh.registerHeadlessRun).toHaveBeenCalledWith('corr-1', 'task-task-99');
    const prompt = agentRun.mock.calls[0]![0];
    expect(prompt).toContain('do the report');
    expect(prompt).toContain('taskId: task-99');
    expect(prompt).toContain('trigger: interval');
    expect(res).toEqual({ ok: true, summary: 'the result' });
    // finally block
    expect(lock.unregisterAgentRunController).toHaveBeenCalledWith('corr-1');
    expect(bh.releaseAgentRun).toHaveBeenCalledWith('corr-1');
    expect(agentRunByGroup.has('task-task-99')).toBe(false);
  });

  it('maps a not-ok summary to a stoppedReason error', async () => {
    agentRun.mockResolvedValue({ ok: false, summary: undefined, stoppedReason: 'aborted' });
    expect(await runTaskAgent(task(), run, trigger)).toEqual({ ok: false, error: 'aborted' });
  });

  it('maps a thrown AppError / Error to an error result and still cleans up', async () => {
    agentRun.mockRejectedValue(new AppError('policy denied'));
    expect(await runTaskAgent(task(), run, trigger)).toEqual({ ok: false, error: 'policy denied' });
    expect(agentRunByGroup.has('task-task-99')).toBe(false);

    agentRun.mockRejectedValue(new Error('boom'));
    expect(await runTaskAgent(task(), run, trigger)).toEqual({ ok: false, error: 'boom' });
  });
});

describe('the injected hooks', () => {
  it('onEvent journals a mapped step event and pushes a handoff notification', async () => {
    await runTaskAgent(task(), run, trigger);
    const h = hooks();

    h.onEvent('step_ok', 'clicked save', 'detail');
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'AgentStepExecuted',
        actor: 'agent',
        redacted: true,
        payload: expect.objectContaining({ kind: 'step_ok', message: '[clicked save]' }) as object,
      }),
    );

    h.onEvent('handoff', 'need a human');
    expect(notify.push).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Handoff', body: 'need a human' }),
    );
  });

  it('onEvent with an unmapped kind journals nothing', async () => {
    await runTaskAgent(task(), run, trigger);
    journal.append.mockClear();
    hooks().onEvent('progress', 'still going');
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('onCheckpoint journals a CheckpointWritten event', async () => {
    await runTaskAgent(task(), run, trigger);
    hooks().onCheckpoint({ step: 3 });
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'CheckpointWritten' }),
    );
  });

  it('requestApproval auto-approves only when the policy pre-approves the tool + origin', async () => {
    await runTaskAgent(task(), run, trigger);
    const req = {
      toolName: 'file_write',
      targetUrl: 'https://site.test/x',
      policy: { reason: 'r' },
    };

    expect(await hooks().requestApproval(req)).toBe(true);
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        payload: expect.objectContaining({ decision: 'preapproved' }) as object,
      }),
    );

    taskCanUseTool.mockReturnValue(false);
    notify.push.mockClear();
    expect(await hooks().requestApproval(req)).toBe(false);
    expect(notify.push).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approval', body: 'file_write: r' }),
    );
  });

  it('appendEvent is a no-op without a database', async () => {
    db.value = null;
    await runTaskAgent(task(), run, trigger);
    journal.append.mockClear();
    hooks().onEvent('step_ok', 'x');
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('swallows a failing journal append during a step event, with a warning', async () => {
    await runTaskAgent(task(), run, trigger);
    journal.append.mockImplementationOnce(() => {
      throw new Error('journal disk full');
    });
    expect(() => hooks().onEvent('step_ok', 'clicked')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Background task journal append failed',
      expect.objectContaining({ err: expect.stringContaining('journal disk full') as string }),
    );
  });

  it('requestApproval declines when the pre-approval target URL will not parse', async () => {
    await runTaskAgent(task(), run, trigger);
    taskCanUseTool.mockReturnValue(true);
    const req = { toolName: 'file_write', targetUrl: '::: not a url', policy: { reason: 'r' } };
    expect(await hooks().requestApproval(req)).toBe(false);
  });
});
