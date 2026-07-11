import { BrowserWindow } from 'electron';
import { IpcChannels, type TasksState } from '@tepegoz/desktop-ipc';
import type { TaskArtifactRecord, TaskDefinition, TaskRunRecord } from '@tepegoz/tasks';
import { TaskStore } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import type { QueuedTaskRun, TaskRunLauncher } from './task-service-support.electron';

/**
 * Mutable process-singleton runtime shared by the task-service concern modules. Previously the
 * `private static` fields of `TaskService`; hoisted here so the scheduler and mutation surfaces can
 * share the same scheduling timer, runner, write-tool provider, in-flight guard and pending queue.
 */
export interface TaskServiceRuntime {
  timer: NodeJS.Timeout | null;
  runner: TaskRunLauncher | null;
  writeToolIdsProvider: (() => string[]) | null;
  runningTaskId: string | null;
  queue: Map<string, QueuedTaskRun>;
}

export const runtime: TaskServiceRuntime = {
  timer: null,
  runner: null,
  writeToolIdsProvider: null,
  runningTaskId: null,
  queue: new Map<string, QueuedTaskRun>(),
};

export function listTasks(): TaskDefinition[] {
  const db = getDb();
  return db === null ? [] : TaskStore.list(db);
}

export function getTask(id: string): TaskDefinition | null {
  const db = getDb();
  return db === null ? null : TaskStore.get(db, id);
}

export function listRuns(taskId?: string): TaskRunRecord[] {
  const db = getDb();
  return db === null ? [] : TaskStore.listRuns(db, taskId);
}

export function listArtifacts(taskId?: string): TaskArtifactRecord[] {
  const db = getDb();
  return db === null ? [] : TaskStore.listArtifacts(db, taskId);
}

export function tasksState(): TasksState {
  return {
    tasks: listTasks(),
    runs: listRuns(),
    artifacts: listArtifacts(),
  };
}

export function broadcast(): void {
  const state = tasksState();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.tasksState, state);
  }
}
