import { describe, expect, it, vi } from 'vitest';

/**
 * `TaskService` — the thin static facade over the four task-service concern modules. Every method is
 * a 1:1 forward; this suite pins that wiring so a method cannot silently point at the wrong sibling.
 */

const stateM = vi.hoisted(() => ({
  getTask: vi.fn(() => ({ id: 't1' })),
  listArtifacts: vi.fn(() => [{ id: 'a1' }]),
  listRuns: vi.fn(() => [{ id: 'r1' }]),
  listTasks: vi.fn(() => [{ id: 't1' }]),
  tasksState: vi.fn(() => ({ tasks: [], runs: [], artifacts: [] })),
}));
vi.mock('./task-service-state.electron', () => stateM);

const mut = vi.hoisted(() => ({
  deleteTask: vi.fn(),
  runCommand: vi.fn(),
  saveTask: vi.fn(() => ({ id: 't1' })),
  setRunner: vi.fn(),
  setWriteToolIdsProvider: vi.fn(),
}));
vi.mock('./task-service-mutations.electron', () => mut);

const sched = vi.hoisted(() => ({ init: vi.fn(), stop: vi.fn() }));
vi.mock('./task-service-scheduler.electron', () => sched);

const { default: TaskService } = await import('./task-service.electron');

describe('TaskService forwards each call to its concern module', () => {
  it('scheduler: init / stop', () => {
    TaskService.init();
    TaskService.stop();
    expect(sched.init).toHaveBeenCalledTimes(1);
    expect(sched.stop).toHaveBeenCalledTimes(1);
  });

  it('mutations: setRunner / setWriteToolIdsProvider / save / delete / command', () => {
    const runner = { launch: vi.fn() } as never;
    const provider = () => ['tool.a'];
    TaskService.setRunner(runner);
    TaskService.setWriteToolIdsProvider(provider);
    TaskService.save({ name: 'x' } as never);
    TaskService.delete('t1');
    TaskService.command({ id: 't1', action: 'run' } as never);
    expect(mut.setRunner).toHaveBeenCalledWith(runner);
    expect(mut.setWriteToolIdsProvider).toHaveBeenCalledWith(provider);
    expect(mut.saveTask).toHaveBeenCalledWith({ name: 'x' });
    expect(mut.deleteTask).toHaveBeenCalledWith('t1');
    expect(mut.runCommand).toHaveBeenCalledWith({ id: 't1', action: 'run' });
  });

  it('state: list / state / get / listRuns / listArtifacts', () => {
    expect(TaskService.list()).toEqual([{ id: 't1' }]);
    expect(TaskService.state()).toEqual({ tasks: [], runs: [], artifacts: [] });
    expect(TaskService.get('t1')).toEqual({ id: 't1' });
    TaskService.listRuns('t1');
    TaskService.listArtifacts('t1');
    expect(stateM.getTask).toHaveBeenCalledWith('t1');
    expect(stateM.listRuns).toHaveBeenCalledWith('t1');
    expect(stateM.listArtifacts).toHaveBeenCalledWith('t1');
  });
});
