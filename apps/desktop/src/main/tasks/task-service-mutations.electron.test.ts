import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `task-service-mutations` — the write side of the task service. Pinned: `setRunner` /
 * `setWriteToolIdsProvider` mutate the shared runtime; `saveTask` guards the DB (503), synthesizes a
 * policy from the autonomy preset + live write-tool set when none is supplied, resolves targetOrigin,
 * carries createdAt / status / sourceConversationId from an existing row, folds in a computed
 * nextRunAt, upserts + broadcasts + returns the stored row; `deleteTask` deletes, drops the queue
 * entry, broadcasts (queue + broadcast even with no DB); and `runCommand` routes run → enqueue,
 * cancel → dequeue, archive/enable/disable → status change (nextRunAt only when re-enabling).
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
vi.mock('@tepegoz/libs', () => ({ AppError }));

const tasksLib = vi.hoisted(() => ({
  normalizeTaskTrigger: vi.fn((t: unknown) => ({ ...(t as object), normalized: true })),
  originOf: vi.fn((u: string | undefined) => (u === undefined ? undefined : 'https://origin.test')),
  synthesizePolicy: vi.fn(() => ({ __synth: true })),
}));
vi.mock('@tepegoz/tasks', () => tasksLib);

const store = vi.hoisted(() => ({
  get: vi.fn((): unknown => null),
  upsert: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@tepegoz/persistence', () => ({ TaskStore: store }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const support = vi.hoisted(() => ({
  computeNextRunAt: vi.fn((): number | undefined => undefined),
  now: () => 1_000,
}));
vi.mock('./task-service-support.electron', () => support);

const runtime = vi.hoisted(
  (): {
    runner: unknown;
    writeToolIdsProvider: (() => string[]) | null;
    queue: Map<string, unknown>;
  } => ({ runner: null, writeToolIdsProvider: null, queue: new Map() }),
);
const stateM = vi.hoisted(() => ({
  broadcast: vi.fn(),
  getTask: vi.fn((): unknown => ({ id: 't1', status: 'enabled' })),
  runtime,
}));
vi.mock('./task-service-state.electron', () => stateM);

const enqueue = vi.hoisted(() => vi.fn());
vi.mock('./task-service-scheduler.electron', () => ({ enqueue }));

const m = await import('./task-service-mutations.electron');

const saveInput = (over: Record<string, unknown> = {}) =>
  ({ name: 'T', prompt: 'p', triggers: [{ type: 'manual' }], ...over }) as never;

/** Run `fn` and return the AppError it threw. */
function grab(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a throw');
}

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  runtime.runner = null;
  runtime.writeToolIdsProvider = null;
  runtime.queue = new Map();
  store.get.mockReturnValue(null);
  support.computeNextRunAt.mockReturnValue(undefined);
  stateM.getTask.mockReturnValue({ id: 't1', status: 'enabled' });
});

describe('runtime injectors', () => {
  it('setRunner / setWriteToolIdsProvider write straight to the shared runtime', () => {
    const r = { launch: vi.fn() } as never;
    const p = () => ['tool.write'];
    m.setRunner(r);
    m.setWriteToolIdsProvider(p);
    expect(runtime.runner).toBe(r);
    expect(runtime.writeToolIdsProvider).toBe(p);
  });
});

describe('saveTask', () => {
  it('throws 503 with no database', () => {
    db.value = null;
    const err = grab(() => m.saveTask(saveInput()));
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('databaseUnavailable');
  });

  it('synthesizes a policy from autonomy + the live write-tool set and resolves targetOrigin', () => {
    runtime.writeToolIdsProvider = () => ['tool.a', 'tool.b'];
    store.get.mockReturnValue({ id: 'new', saved: true });
    const saved = m.saveTask(saveInput({ autonomy: 'act', targetUrl: 'https://site.test/x' }));
    expect(tasksLib.synthesizePolicy).toHaveBeenCalledWith('act', {
      targetOrigin: 'https://origin.test',
      writeToolIds: ['tool.a', 'tool.b'],
    });
    const upserted = store.upsert.mock.calls[0]![1] as Record<string, unknown>;
    expect(upserted).toMatchObject({
      name: 'T',
      policy: { __synth: true },
      targetOrigin: 'https://origin.test',
      createdAt: 1_000,
      updatedAt: 1_000,
      triggers: [{ type: 'manual', normalized: true }],
    });
    expect(stateM.broadcast).toHaveBeenCalled();
    expect(saved).toEqual({ id: 'new', saved: true });
  });

  it('prefers an explicit policy and folds in a computed nextRunAt', () => {
    support.computeNextRunAt.mockReturnValue(9_000);
    m.saveTask(saveInput({ policy: { __explicit: true } }));
    expect(tasksLib.synthesizePolicy).not.toHaveBeenCalled();
    expect(store.upsert.mock.calls[0]![1]).toMatchObject({
      policy: { __explicit: true },
      nextRunAt: 9_000,
    });
  });

  it('carries createdAt / status / sourceConversationId from an existing row', () => {
    store.get.mockReturnValue({
      status: 'disabled',
      createdAt: 42,
      sourceConversationId: 'conv-9',
    });
    m.saveTask(saveInput({ id: 't1' }));
    expect(store.upsert.mock.calls[0]![1]).toMatchObject({
      id: 't1',
      status: 'disabled',
      createdAt: 42,
      sourceConversationId: 'conv-9',
    });
  });

  it('takes sourceConversationId straight from the input, over any existing row value', () => {
    store.get.mockReturnValue({ status: 'enabled', createdAt: 42, sourceConversationId: 'conv-old' });
    m.saveTask(saveInput({ id: 't1', sourceConversationId: 'conv-new' }));
    expect(store.upsert.mock.calls[0]![1]).toMatchObject({ sourceConversationId: 'conv-new' });
  });
});

describe('deleteTask', () => {
  it('deletes the row, drops the queue entry and broadcasts', () => {
    runtime.queue.set('t1', {});
    m.deleteTask('t1');
    expect(store.delete).toHaveBeenCalledWith({ __db: true }, 't1');
    expect(runtime.queue.has('t1')).toBe(false);
    expect(stateM.broadcast).toHaveBeenCalled();
  });

  it('still clears the queue + broadcasts with no database', () => {
    db.value = null;
    runtime.queue.set('t1', {});
    m.deleteTask('t1');
    expect(store.delete).not.toHaveBeenCalled();
    expect(runtime.queue.has('t1')).toBe(false);
    expect(stateM.broadcast).toHaveBeenCalled();
  });
});

describe('runCommand', () => {
  it('404s an unknown task', () => {
    stateM.getTask.mockReturnValue(null);
    const err = grab(() => m.runCommand({ id: 'x', action: 'run' } as never));
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('taskNotFound');
  });

  it('run enqueues a manual trigger', () => {
    m.runCommand({ id: 't1', action: 'run' } as never);
    expect(enqueue).toHaveBeenCalledWith({ id: 't1', status: 'enabled' }, { type: 'manual' });
  });

  it('cancel drops the queue entry and broadcasts', () => {
    runtime.queue.set('t1', {});
    m.runCommand({ id: 't1', action: 'cancel' } as never);
    expect(runtime.queue.has('t1')).toBe(false);
    expect(stateM.broadcast).toHaveBeenCalled();
  });

  it('disable upserts the new status with no nextRunAt; enable recomputes it', () => {
    support.computeNextRunAt.mockReturnValue(7_000);
    m.runCommand({ id: 't1', action: 'disable' } as never);
    expect(store.upsert.mock.calls[0]![1]).toMatchObject({ status: 'disabled' });
    expect((store.upsert.mock.calls[0]![1] as Record<string, unknown>).nextRunAt).toBeUndefined();

    store.upsert.mockClear();
    m.runCommand({ id: 't1', action: 'enable' } as never);
    expect(store.upsert.mock.calls[0]![1]).toMatchObject({ status: 'enabled', nextRunAt: 7_000 });
  });

  it('a status change is a no-op with no database', () => {
    db.value = null;
    m.runCommand({ id: 't1', action: 'archive' } as never);
    expect(store.upsert).not.toHaveBeenCalled();
  });
});
