import type { TaskCommandInput, TaskDefinition, TaskSaveInput } from '@tepegoz/tasks';
import type { TaskToolsHost } from '@tepegoz/tasks/tools';
import TaskService from './task-service.electron';

export const taskToolsHost: TaskToolsHost = {
  listTasks: () => TaskService.list(),
  getTask: (id: string): TaskDefinition | null => TaskService.get(id),
  saveTask: (input: TaskSaveInput): TaskDefinition => TaskService.save(input),
  commandTask: (input: TaskCommandInput): { ok: true } => {
    TaskService.command(input);
    return { ok: true };
  },
};
