import { describe, expect, it, vi } from 'vitest';

/**
 * `taskToolsHost` — the Electron host for the `task_*` agent tools. Every method is a 1:1 forward to
 * `TaskService`; `commandTask` additionally returns `{ ok: true }`.
 */

const svc = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 't1' }]),
  get: vi.fn(() => ({ id: 't1' })),
  save: vi.fn(() => ({ id: 't1' })),
  command: vi.fn(),
}));
vi.mock('./task-service.electron', () => ({ default: svc }));

const { taskToolsHost } = await import('./task-tools-host.electron');

describe('taskToolsHost', () => {
  it('list / get / save forward to TaskService', () => {
    expect(taskToolsHost.listTasks()).toEqual([{ id: 't1' }]);
    taskToolsHost.getTask('t1');
    taskToolsHost.saveTask({ name: 'x' } as never);
    expect(svc.get).toHaveBeenCalledWith('t1');
    expect(svc.save).toHaveBeenCalledWith({ name: 'x' });
  });

  it('commandTask runs the command then acknowledges', () => {
    expect(taskToolsHost.commandTask({ id: 't1', action: 'run' } as never)).toEqual({ ok: true });
    expect(svc.command).toHaveBeenCalledWith({ id: 't1', action: 'run' });
  });
});
