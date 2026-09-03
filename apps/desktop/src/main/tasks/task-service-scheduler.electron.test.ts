import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Let the tick()'s chain of awaits (evaluate → drain → runQueued → launcher) settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * `task-service-scheduler` — the task-service tick loop + run queue. Pinned: `init` is a one-shot that
 * arms the interval and ticks once; `stop` disarms it and clears the queue; `enqueue` builds a queued
 * `TaskRunRecord` (deduped against an already-queued / running task) and audits it; a due interval
 * task flows tick → enqueue → drain → the injected runner, recording running/succeeded runs, the
 * lastRunAt bump, and the start/done notifications gated on the task policy; a failing runner records
 * a failed run + error notification; and a pageChange trigger enqueues only when its baseline hash
 * actually moved.
 */

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const store = vi.hoisted(() => ({
  list: vi.fn((): unknown[] => []),
  due: vi.fn((): unknown[] => []),
  upsert: vi.fn(),
  upsertRun: vi.fn(),
  listTriggerState: vi.fn((): unknown[] => []),
  upsertTriggerState: vi.fn(),
}));
vi.mock('@tepegoz/persistence', () => ({ TaskStore: store }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const notify = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../notifications/notification-host', () => ({ default: notify }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    tasks: {
      notifications: {
        startedTitle: 'Started {name}',
        doneTitle: 'Done {name}',
        failedTitle: 'Failed {name}',
      },
    },
  }),
}));

const support = vi.hoisted(() => ({
  MAX_BASELINE_PREVIEW: 240,
  TICK_MS: 30_000,
  appendAudit: vi.fn<(type: string, payload: object, correlationId: string) => void>(),
  computeNextRunAt: vi.fn((): number | undefined => 5_000),
  hashText: (s: string) => `h:${s}`,
  now: () => 1_000,
  readPageChangeText: vi.fn(() => Promise.resolve({ url: 'https://w.test/', text: 'BODY' })),
  triggerKey: (_t: unknown, i: number) => `k${String(i)}`,
  triggerSource: (t: { url?: string; source?: string }) => t.url ?? t.source,
  triggerType: (t: { type: string }) => t.type,
}));
vi.mock('./task-service-support.electron', () => support);

const runtime = vi.hoisted(
  (): {
    timer: ReturnType<typeof setInterval> | null;
    queue: Map<string, unknown>;
    runningTaskId: string | null;
    runner: unknown;
  } => ({ timer: null, queue: new Map(), runningTaskId: null, runner: null }),
);
const stateM = vi.hoisted(() => ({ broadcast: vi.fn(), runtime }));
vi.mock('./task-service-state.electron', () => stateM);

const sched = await import('./task-service-scheduler.electron');

const POLICY = { notifyOnStart: false, notifyOnDone: false, notifyOnError: false };
const task = (over: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    name: 'Nightly',
    prompt: 'do the thing',
    status: 'enabled',
    triggers: [{ type: 'interval', enabled: true }],
    policy: POLICY,
    nextRunAt: 0,
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  runtime.timer = null;
  runtime.queue = new Map();
  runtime.runningTaskId = null;
  runtime.runner = null;
  store.list.mockReturnValue([]);
  store.due.mockReturnValue([]);
  store.listTriggerState.mockReturnValue([]);
  support.computeNextRunAt.mockReturnValue(5_000);
});
afterEach(() => {
  sched.stop();
});

describe('init / stop', () => {
  it('init arms the interval and ticks once; a second init is a no-op', () => {
    sched.init();
    expect(runtime.timer).not.toBeNull();
    const armed = runtime.timer;
    sched.init();
    expect(runtime.timer).toBe(armed);
  });

  it('stop disarms the timer and clears the queue + running marker', () => {
    sched.init();
    runtime.queue.set('t1', {});
    runtime.runningTaskId = 't1';
    sched.stop();
    expect(runtime.timer).toBeNull();
    expect(runtime.queue.size).toBe(0);
    expect(runtime.runningTaskId).toBeNull();
  });

  it('init recomputes nextRunAt for enabled tasks that lack one', () => {
    store.list.mockReturnValue([
      { id: 'a', status: 'enabled', nextRunAt: undefined, triggers: [] },
      { id: 'b', status: 'disabled', nextRunAt: undefined, triggers: [] },
      { id: 'c', status: 'enabled', nextRunAt: 123, triggers: [] },
    ]);
    sched.init();
    const upserted = store.upsert.mock.calls.map((c) => (c[1] as { id: string }).id);
    expect(upserted).toEqual(['a']);
  });
});

describe('enqueue', () => {
  it('builds a queued run record, persists it, broadcasts and audits', () => {
    sched.enqueue(task(), { type: 'interval', enabled: true } as never);
    const entry = runtime.queue.get('t1') as {
      run: { status: string; triggerType: string; correlationId: string };
    };
    expect(entry.run).toMatchObject({ taskId: 't1', status: 'queued', triggerType: 'interval' });
    expect(store.upsertRun).toHaveBeenCalledWith({ __db: true }, entry.run);
    expect(stateM.broadcast).toHaveBeenCalled();
    expect(support.appendAudit).toHaveBeenCalledWith(
      'TaskQueued',
      expect.objectContaining({ taskId: 't1', triggerType: 'interval' }),
      entry.run.correlationId,
    );
  });

  it('is a no-op when the task is already queued or currently running', () => {
    runtime.queue.set('t1', {});
    sched.enqueue(task(), { type: 'manual' } as never);
    expect(support.appendAudit).not.toHaveBeenCalled();

    runtime.queue.clear();
    runtime.runningTaskId = 't1';
    sched.enqueue(task(), { type: 'manual' } as never);
    expect(support.appendAudit).not.toHaveBeenCalled();
  });

  it('carries the trigger source when the trigger has one', () => {
    sched.enqueue(task(), { type: 'external', source: 'github' } as never);
    const entry = runtime.queue.get('t1') as { run: { triggerSource?: string } };
    expect(entry.run.triggerSource).toBe('github');
  });
});

describe('a due interval task runs end to end', () => {
  it('tick → enqueue → drain → the injected runner, recording running + succeeded', async () => {
    const runner = vi.fn(() => Promise.resolve({ ok: true, summary: 'all good' }));
    runtime.runner = runner;
    store.due.mockReturnValue([task({ nextRunAt: 0 })]);

    sched.init();
    await flush();

    expect(runner).toHaveBeenCalledTimes(1);
    const statuses = store.upsertRun.mock.calls.map((c) => (c[1] as { status: string }).status);
    expect(statuses).toEqual(['queued', 'running', 'succeeded']);
    // lastRunAt bump on the task
    expect(store.upsert).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ id: 't1', lastRunAt: 1_000 }),
    );
    expect(support.appendAudit.mock.calls.map((c) => c[0])).toContain('TaskSucceeded');
  });

  it('records a failed run and fires the error notification when the runner rejects the work', async () => {
    runtime.runner = vi.fn(() => Promise.resolve({ ok: false, error: 'boom' }));
    store.due.mockReturnValue([task({ policy: { ...POLICY, notifyOnError: true }, nextRunAt: 0 })]);

    sched.init();
    await flush();

    const last = store.upsertRun.mock.calls.at(-1)![1] as { status: string; error: string };
    expect(last).toMatchObject({ status: 'failed', error: 'boom' });
    expect(notify.push).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', title: 'Failed Nightly' }),
    );
  });

  it('with no runner attached, the run is recorded failed with the "not attached" error', async () => {
    runtime.runner = null;
    store.due.mockReturnValue([task({ nextRunAt: 0 })]);
    sched.init();
    await flush();
    const last = store.upsertRun.mock.calls.at(-1)![1] as { status: string; error: string };
    expect(last.status).toBe('failed');
    expect(last.error).toMatch(/not attached/);
  });
});

describe('pageChange evaluation', () => {
  it('enqueues only when the baseline hash has moved', async () => {
    runtime.runner = vi.fn(() => Promise.resolve({ ok: true }));
    const pcTask = task({ triggers: [{ type: 'pageChange', enabled: true, everyMinutes: 5 }] });
    store.due.mockReturnValue([pcTask]);
    // stored baseline differs from the fresh hash → change detected
    store.listTriggerState.mockReturnValue([
      { triggerKey: 'k0', nextCheckAt: 0, baselineHash: 'h:OLD' },
    ]);

    sched.init();
    await flush();

    expect(support.appendAudit.mock.calls.map((c) => c[0])).toContain('TaskQueued');
    expect(store.upsertTriggerState).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ lastFiredAt: 1_000 }),
    );
  });

  it('does not enqueue when the fresh hash matches the stored baseline', async () => {
    const pcTask = task({ triggers: [{ type: 'pageChange', enabled: true, everyMinutes: 5 }] });
    store.due.mockReturnValue([pcTask]);
    store.listTriggerState.mockReturnValue([
      { triggerKey: 'k0', nextCheckAt: 0, baselineHash: 'h:https://w.test/\nBODY' },
    ]);

    sched.init();
    await flush();

    expect(support.appendAudit.mock.calls.map((c) => c[0])).not.toContain('TaskQueued');
  });

  it('records the error on the trigger state when the page read throws', async () => {
    support.readPageChangeText.mockRejectedValue(new Error('tab blocked'));
    const pcTask = task({ triggers: [{ type: 'pageChange', enabled: true, everyMinutes: 5 }] });
    store.due.mockReturnValue([pcTask]);

    sched.init();
    await flush();

    expect(store.upsertTriggerState).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ error: 'tab blocked' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('interval callback + start/done notifications', () => {
  it('the armed interval fires a scheduled tick after TICK_MS', async () => {
    vi.useFakeTimers();
    try {
      store.due.mockReturnValue([]);
      sched.init();
      store.due.mockClear();
      await vi.advanceTimersByTimeAsync(30_000); // one TICK_MS → setInterval's `void tick()`
      expect(runtime.timer).not.toBeNull();
      expect(store.due).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires the start and done notifications when the task policy asks for them', async () => {
    runtime.runner = vi.fn(() => Promise.resolve({ ok: true, summary: 'all done' }));
    store.due.mockReturnValue([
      task({
        policy: { notifyOnStart: true, notifyOnDone: true, notifyOnError: false },
        nextRunAt: 0,
      }),
    ]);

    sched.init();
    await flush();

    expect(notify.push).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'info',
        title: 'Started Nightly',
        channels: ['center', 'toast'],
      }),
    );
    expect(notify.push).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'info', title: 'Done Nightly' }),
    );
  });
});
