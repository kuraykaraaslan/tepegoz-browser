import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/** The saved-tasks slice of the preload bridge — id/input-addressed delegation + a state subscription. */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { tasksApi } = await import('./api-tasks');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
});

it('id / input methods hit their channels with the raw arg', () => {
  void tasksApi.getTask('task-1');
  void tasksApi.deleteTask('task-1');
  void tasksApi.saveTask({ name: 'n' } as never);
  void tasksApi.runTaskNow({ id: 'task-1', action: 'run' } as never);
  void tasksApi.cancelTaskRun({ id: 'task-1', action: 'cancel' } as never);
  void tasksApi.setTaskEnabled({ id: 'task-1', enabled: false });
  expect(invoke.mock.calls).toEqual([
    [IpcChannels.tasksGet, 'task-1'],
    [IpcChannels.tasksDelete, 'task-1'],
    [IpcChannels.tasksSave, { name: 'n' }],
    [IpcChannels.tasksRunNow, { id: 'task-1', action: 'run' }],
    [IpcChannels.tasksCancelRun, { id: 'task-1', action: 'cancel' }],
    [IpcChannels.tasksSetEnabled, { id: 'task-1', enabled: false }],
  ]);
});

it('listTasks hits its channel with no argument', () => {
  void tasksApi.listTasks();
  expect(invoke).toHaveBeenCalledWith(IpcChannels.tasksList);
});

it('the list filters pass an optional taskId through (undefined = all)', () => {
  void tasksApi.listTaskRuns();
  void tasksApi.listTaskArtifacts('task-1');
  expect(invoke).toHaveBeenNthCalledWith(1, IpcChannels.tasksListRuns, undefined);
  expect(invoke).toHaveBeenNthCalledWith(2, IpcChannels.tasksListArtifacts, 'task-1');
});

describe('onTasksState', () => {
  it('wires, forwards only the state, and unsubscribes', () => {
    const cb = vi.fn();
    const off = tasksApi.onTasksState(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;
    listener({}, { tasks: [] });
    expect(cb).toHaveBeenCalledWith({ tasks: [] });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.tasksState, listener);
  });
});
