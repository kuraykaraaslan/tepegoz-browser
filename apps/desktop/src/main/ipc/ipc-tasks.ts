import { z } from 'zod';
import {
  IpcChannels,
  type TaskArtifactRecord,
  type TaskDefinition,
  type TaskRunRecord,
  type TasksImportResult,
} from '@tepegoz/desktop-ipc';
import {
  TaskCommandInputSchema,
  TaskSaveInputSchema,
  TasksImportJsonSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { AppError } from '@tepegoz/libs';
import { parseTasksImport } from '@tepegoz/persistence';
import TaskService from '../tasks/task-service.electron';
import { handle } from './ipc-helpers';

const TaskIdSchema = z.string().min(1).max(128);
const OptionalTaskIdSchema = z.string().min(1).max(128).optional();
const TaskEnabledSchema = z.object({ id: TaskIdSchema, enabled: z.boolean() });
const TaskRunNowSchema = z.object({
  id: TaskIdSchema,
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export function registerTasksIpc(): void {
  handle(IpcChannels.tasksList, (): TaskDefinition[] => TaskService.list());
  handle(IpcChannels.tasksGet, (_event, payload): TaskDefinition | null =>
    TaskService.get(TaskIdSchema.parse(payload)),
  );
  handle(IpcChannels.tasksSave, (_event, payload): TaskDefinition =>
    TaskService.save(TaskSaveInputSchema.parse(payload)),
  );
  handle(IpcChannels.tasksDelete, (_event, payload): void => {
    TaskService.delete(TaskIdSchema.parse(payload));
  });
  handle(IpcChannels.tasksRunNow, (_event, payload): void => {
    const input = TaskRunNowSchema.parse(payload);
    TaskService.command(TaskCommandInputSchema.parse({ ...input, action: 'run' }));
  });
  handle(IpcChannels.tasksCancelRun, (_event, payload): void => {
    const input = TaskRunNowSchema.parse(payload);
    TaskService.command(TaskCommandInputSchema.parse({ ...input, action: 'cancel' }));
  });
  handle(IpcChannels.tasksSetEnabled, (_event, payload): void => {
    const { id, enabled } = TaskEnabledSchema.parse(payload);
    TaskService.command({ id, action: enabled ? 'enable' : 'disable' });
  });
  handle(IpcChannels.tasksListRuns, (_event, payload): TaskRunRecord[] =>
    TaskService.listRuns(OptionalTaskIdSchema.parse(payload)),
  );
  handle(IpcChannels.tasksListArtifacts, (_event, payload): TaskArtifactRecord[] =>
    TaskService.listArtifacts(OptionalTaskIdSchema.parse(payload)),
  );
  handle(IpcChannels.tasksExport, (): string => {
    // No policy, no run history — main only stringifies the reusable configuration; the untrusted
    // renderer does the Blob download, same split as macros/bookmarks/history/preferences export.
    return TaskService.exportJson();
  });
  handle(IpcChannels.tasksImport, (_event, payload): TasksImportResult => {
    const json = TasksImportJsonSchema.parse(payload);
    let split: ReturnType<typeof parseTasksImport>;
    try {
      split = parseTasksImport(json);
    } catch {
      // Not JSON, or JSON with no task list — a malformed file is a bad request, mapped to the same
      // generic localized 400 as any other rejected renderer payload.
      throw new AppError('Tasks import is not a valid export file', 400, 'badRequest');
    }
    return { imported: TaskService.importTasks(split.tasks), skipped: split.skipped };
  });
}
