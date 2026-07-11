import type { TasksState } from '@tepegoz/desktop-ipc';
import type {
  TaskArtifactRecord,
  TaskCommandInput,
  TaskDefinition,
  TaskRunRecord,
  TaskSaveInput,
} from '@tepegoz/tasks';
import type { TaskRunLauncher } from './task-service-support.electron';
import {
  getTask,
  listArtifacts,
  listRuns,
  listTasks,
  tasksState,
} from './task-service-state.electron';
import {
  deleteTask,
  runCommand,
  saveTask,
  setRunner,
  setWriteToolIdsProvider,
} from './task-service-mutations.electron';
import { init, stop } from './task-service-scheduler.electron';

export type { TaskRunLaunchResult, TaskRunLauncher } from './task-service-support.electron';

/**
 * Thin facade over the task-service concern modules (`-scheduler`, `-mutations`, `-state`, `-support`).
 * Keeps the historic `TaskService.*` static surface intact while the implementation lives in siblings.
 */
export default class TaskService {
  static init(): void {
    init();
  }

  static stop(): void {
    stop();
  }

  static setRunner(runner: TaskRunLauncher | null): void {
    setRunner(runner);
  }

  /**
   * Inject a provider that lists the write-class tool ids the agent can currently run. Used to synthesize
   * a task's {@link TaskPolicy} from its autonomy preset at save time — kept out of `@tepegoz/tasks` so the
   * package stays free of a hard capability-plane dependency (mirrors {@link setRunner}).
   */
  static setWriteToolIdsProvider(provider: (() => string[]) | null): void {
    setWriteToolIdsProvider(provider);
  }

  static list(): TaskDefinition[] {
    return listTasks();
  }

  static state(): TasksState {
    return tasksState();
  }

  static get(id: string): TaskDefinition | null {
    return getTask(id);
  }

  static save(input: TaskSaveInput): TaskDefinition {
    return saveTask(input);
  }

  static delete(id: string): void {
    deleteTask(id);
  }

  static listRuns(taskId?: string): TaskRunRecord[] {
    return listRuns(taskId);
  }

  static listArtifacts(taskId?: string): TaskArtifactRecord[] {
    return listArtifacts(taskId);
  }

  static command(input: TaskCommandInput): void {
    runCommand(input);
  }
}
