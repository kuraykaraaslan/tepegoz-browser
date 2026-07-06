import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type TaskArtifactRecord,
  type TaskCommandInput,
  type TaskDefinition,
  type TaskRunRecord,
  type TaskSaveInput,
  type TasksState,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

export const tasksApi: Pick<
  TepegozApi,
  | 'listTasks'
  | 'getTask'
  | 'saveTask'
  | 'deleteTask'
  | 'runTaskNow'
  | 'cancelTaskRun'
  | 'setTaskEnabled'
  | 'listTaskRuns'
  | 'listTaskArtifacts'
  | 'onTasksState'
> = {
  listTasks: () => invoke<TaskDefinition[]>(IpcChannels.tasksList),
  getTask: (id: string) => invoke<TaskDefinition | null>(IpcChannels.tasksGet, id),
  saveTask: (input: TaskSaveInput) => invoke<TaskDefinition>(IpcChannels.tasksSave, input),
  deleteTask: (id: string) => invoke<void>(IpcChannels.tasksDelete, id),
  runTaskNow: (input: TaskCommandInput) => invoke<void>(IpcChannels.tasksRunNow, input),
  cancelTaskRun: (input: TaskCommandInput) => invoke<void>(IpcChannels.tasksCancelRun, input),
  setTaskEnabled: (input: { id: string; enabled: boolean }) =>
    invoke<void>(IpcChannels.tasksSetEnabled, input),
  listTaskRuns: (taskId?: string) => invoke<TaskRunRecord[]>(IpcChannels.tasksListRuns, taskId),
  listTaskArtifacts: (taskId?: string) =>
    invoke<TaskArtifactRecord[]>(IpcChannels.tasksListArtifacts, taskId),
  onTasksState: (callback: (state: TasksState) => void) => {
    const listener = (_event: unknown, state: TasksState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.tasksState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tasksState, listener);
    };
  },
};
