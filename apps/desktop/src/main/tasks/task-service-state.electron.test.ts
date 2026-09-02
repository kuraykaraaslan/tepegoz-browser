import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `task-service-state` — the read side + the mutable process-singleton runtime shared by the
 * task-service concern modules. Pinned: every list reader returns its empty value (never throws)
 * before the DB is ready and otherwise forwards to `TaskStore`; `tasksState` composes the three;
 * `broadcast` pushes that snapshot to every live window and skips destroyed ones; and `runtime`
 * starts empty.
 */

const store = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 't1' }]),
  get: vi.fn((): unknown => ({ id: 't1' })),
  listRuns: vi.fn(() => [{ id: 'r1' }]),
  listArtifacts: vi.fn(() => [{ id: 'a1' }]),
}));
vi.mock('@tepegoz/persistence', () => ({ TaskStore: store }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const windows = vi.hoisted(
  (): {
    list: { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }[];
  } => ({ list: [] }),
);
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows.list } }));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { tasksState: 'tasks:state' } }));

const state = await import('./task-service-state.electron');

const win = (destroyed = false) => ({
  isDestroyed: () => destroyed,
  webContents: { send: vi.fn() },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  windows.list = [];
});

describe('the readers', () => {
  it('return their empty value with no database and never call the store', () => {
    db.value = null;
    expect(state.listTasks()).toEqual([]);
    expect(state.getTask('t1')).toBeNull();
    expect(state.listRuns()).toEqual([]);
    expect(state.listArtifacts()).toEqual([]);
    expect(store.list).not.toHaveBeenCalled();
  });

  it('forward to TaskStore with the db (and the optional taskId) when it is ready', () => {
    state.listTasks();
    state.getTask('t1');
    state.listRuns('t1');
    state.listArtifacts('t1');
    expect(store.list).toHaveBeenCalledWith({ __db: true });
    expect(store.get).toHaveBeenCalledWith({ __db: true }, 't1');
    expect(store.listRuns).toHaveBeenCalledWith({ __db: true }, 't1');
    expect(store.listArtifacts).toHaveBeenCalledWith({ __db: true }, 't1');
  });
});

describe('tasksState', () => {
  it('composes the three readers into one snapshot', () => {
    expect(state.tasksState()).toEqual({
      tasks: [{ id: 't1' }],
      runs: [{ id: 'r1' }],
      artifacts: [{ id: 'a1' }],
    });
  });
});

describe('broadcast', () => {
  it('sends the snapshot to every live window and skips destroyed ones', () => {
    const live = win();
    const dead = win(true);
    windows.list = [live, dead];
    state.broadcast();
    expect(live.webContents.send).toHaveBeenCalledWith('tasks:state', {
      tasks: [{ id: 't1' }],
      runs: [{ id: 'r1' }],
      artifacts: [{ id: 'a1' }],
    });
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });
});

describe('runtime', () => {
  it('is an empty process singleton', () => {
    expect(state.runtime).toMatchObject({
      timer: null,
      runner: null,
      writeToolIdsProvider: null,
      runningTaskId: null,
    });
    expect(state.runtime.queue.size).toBe(0);
  });
});
