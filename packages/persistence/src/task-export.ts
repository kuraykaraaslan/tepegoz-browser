import { TaskImportEntrySchema, type TaskImportEntry } from '@tepegoz/tasks/schemas';
import type { TaskDefinition } from '@tepegoz/tasks';

/**
 * Serialize + parse the user's SCHEDULED TASKS for a user-initiated backup — the tasks counterpart of
 * {@link serializeMacrosJson}/{@link parseMacrosImport} (`./macro-export`): same envelope shape, same
 * "validate every entry on its own, skip what fails" discipline.
 *
 * WHAT TRAVELS, ON PURPOSE: a task's reusable configuration — name, prompt, description, status,
 * triggers (schedule), and target page. Not its run history or artifacts: those live in separate tables
 * (`task_runs`, `task_artifacts`) and are a LOG of what already happened on THIS install, not something
 * to replay on another one — the exact scoping call the macros export already makes (a macro export is
 * the recorded script, never a log of past runs).
 *
 * WHAT NEVER TRAVELS, ON PURPOSE:
 *  - `policy` (the concrete preapproved-write-tool allowlist + allowed origins): a task carries real
 *    capability (ADR-0021's unattended auto-approve, scoped to the task's own origin). Exporting is a
 *    JSON dump of DATA the user chose to move; it must never itself be a way to hand a task auto-approval
 *    it never earned on this install. `TaskImportEntrySchema` (from `@tepegoz/tasks/schemas`) enforces
 *    this at the parse boundary — it has no `policy`/`autonomy` field, so those keys are stripped even if
 *    present in the file — and every accepted entry is written through the SAME `saveTask` path the
 *    manual "New task" UI already uses, which synthesizes the policy fresh from the CURRENT install's own
 *    live tool registry. An imported task always starts in `notify` mode: no allowlist, every write
 *    pauses for approval, same as a task the user just typed in.
 *  - `sourceConversationId` (the agent chat a task was converted from): agent conversations have no
 *    export path of their own (see docs/data-and-backup.md's "What you cannot export yet"), so the id
 *    would not resolve on another install. Left off rather than carried over as a dangling reference.
 */

export const TASKS_EXPORT_FORMAT = 'tepegoz.tasks';
/** Envelope schema version — bumped only if the *file wrapper* changes, not the per-task entry shape. */
export const TASKS_EXPORT_VERSION = 1;

export interface TasksExportFile {
  format: typeof TASKS_EXPORT_FORMAT;
  version: number;
  tasks: TaskImportEntry[];
}

function toExportEntry(task: TaskDefinition): TaskImportEntry {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    ...(task.description !== undefined ? { description: task.description } : {}),
    status: task.status,
    triggers: task.triggers,
    ...(task.targetUrl !== undefined ? { targetUrl: task.targetUrl } : {}),
    ...(task.targetOrigin !== undefined ? { targetOrigin: task.targetOrigin } : {}),
  };
}

/** Every saved task as one pretty-printed JSON document (stable key order, newline-terminated). */
export function serializeTasksJson(tasks: readonly TaskDefinition[]): string {
  const file: TasksExportFile = {
    format: TASKS_EXPORT_FORMAT,
    version: TASKS_EXPORT_VERSION,
    tasks: tasks.map(toExportEntry),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Split a previously exported tasks file into the entries that can be re-applied and a count of the ones
 * that cannot.
 *
 * The file is untrusted (hand-edited, from an older build, or not a tasks file at all), so every entry is
 * checked on its own against {@link TaskImportEntrySchema}. An entry the schema rejects is dropped and
 * counted in `skipped` rather than failing the whole import — one bad task should not cost the user the
 * other nine that are fine. An entry that IS structurally a task but also smuggles a `policy`/`autonomy`
 * field is still accepted — those two keys are simply not part of the schema, so they are stripped, not
 * flagged (see the module doc above).
 *
 * Accepts either the `{ format, version, tasks }` envelope this app writes or a bare JSON array of tasks
 * (so a hand-assembled list still imports). A file that is not JSON, or is JSON with no task list at all,
 * is rejected outright with a {@link SyntaxError} — there is nothing to apply.
 */
export function parseTasksImport(json: string): { tasks: TaskImportEntry[]; skipped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SyntaxError('Tasks import is not valid JSON.');
  }

  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as TasksExportFile).tasks)
  ) {
    list = (raw as TasksExportFile).tasks;
  } else {
    throw new SyntaxError('Tasks import must be a JSON array or an export file with a "tasks" array.');
  }

  const tasks: TaskImportEntry[] = [];
  let skipped = 0;
  for (const entry of list as unknown[]) {
    const parsed = TaskImportEntrySchema.safeParse(entry);
    if (parsed.success) tasks.push(parsed.data);
    else skipped += 1;
  }
  return { tasks, skipped };
}
