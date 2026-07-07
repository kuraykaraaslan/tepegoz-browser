/**
 * Pure, React-free logic for the Scheduled Tasks page — mirrors the "thin component + tested model" split
 * used by the desktop DeveloperSection. Turns tasks into table rows, summarizes schedules, and builds the
 * form state ↔ {@link TaskSaveInput} mapping. Everything here is unit-tested (see tasks-page-model.test.ts).
 */
import {
  DEFAULT_INTERVAL_MINUTES,
  MIN_TASK_INTERVAL_MINUTES,
  deriveTaskName,
  presetToTrigger,
  primaryScheduleTrigger,
  type SchedulePreset,
  type TaskAutonomyPreset,
  type TaskDefinition,
  type TaskPageChangeMode,
  type TaskPolicy,
  type TaskRunRecord,
  type TaskRunStatus,
  type TaskSaveInput,
  type TaskStatus,
  type TaskTrigger,
} from '@tepegoz/tasks';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary';

export interface TaskRow extends Record<string, unknown> {
  id: string;
  name: string;
  scheduleText: string;
  status: TaskStatus;
  statusVariant: BadgeVariant;
  lastRunText: string;
  nextRunText: string;
  sourceConversationId: string | undefined;
}

export interface ScheduleSummaryLabels {
  /** Uses a `{n}` placeholder, e.g. "Every {n} min". */
  everyMinutes: string;
  pageChange: string;
  manual: string;
}

export function statusVariant(status: TaskStatus): BadgeVariant {
  if (status === 'enabled') return 'success';
  if (status === 'archived') return 'warning';
  return 'neutral';
}

export function runStatusVariant(status: TaskRunStatus): BadgeVariant {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
      return 'info';
    case 'awaiting_approval':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Format an epoch-ms timestamp, or the `none` placeholder when absent. */
export function fmtTime(ms: number | undefined, none: string): string {
  return ms === undefined ? none : new Date(ms).toLocaleString();
}

/** A one-line description of a task's schedule (its first non-manual trigger). */
export function triggerSummary(
  triggers: readonly TaskTrigger[],
  labels: ScheduleSummaryLabels,
): string {
  const primary = primaryScheduleTrigger(triggers);
  if (primary === undefined) return labels.manual;
  if (primary.type === 'interval') {
    return labels.everyMinutes.replace('{n}', String(primary.everyMinutes));
  }
  if (primary.type === 'pageChange') {
    let host = primary.url;
    try {
      host = new URL(primary.url).host;
    } catch {
      /* keep raw url */
    }
    return `${labels.pageChange} · ${host}`;
  }
  return labels.manual;
}

export interface RowLabels {
  schedule: ScheduleSummaryLabels;
  none: string;
}

export function toTaskRows(tasks: readonly TaskDefinition[], labels: RowLabels): TaskRow[] {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    scheduleText: triggerSummary(task.triggers, labels.schedule),
    status: task.status,
    statusVariant: statusVariant(task.status),
    lastRunText: fmtTime(task.lastRunAt, labels.none),
    nextRunText: fmtTime(task.nextRunAt, labels.none),
    sourceConversationId: task.sourceConversationId,
  }));
}

/** The most recent run for a task from an already-newest-first list. */
export function latestRunForTask(
  runs: readonly TaskRunRecord[],
  taskId: string,
): TaskRunRecord | undefined {
  return runs.find((run) => run.taskId === taskId);
}

// ---- Form state <-> TaskSaveInput -------------------------------------------------------------------

export interface TaskFormState {
  /** Present when editing or re-converting in place. */
  id: string | undefined;
  name: string;
  prompt: string;
  targetUrl: string;
  preset: SchedulePreset;
  everyMinutes: number;
  selector: string;
  changeMode: TaskPageChangeMode;
  autonomy: TaskAutonomyPreset;
  sourceConversationId: string | undefined;
}

export function blankFormState(): TaskFormState {
  return {
    id: undefined,
    name: '',
    prompt: '',
    targetUrl: '',
    preset: 'interval',
    everyMinutes: DEFAULT_INTERVAL_MINUTES,
    selector: '',
    changeMode: 'textHash',
    autonomy: 'notify',
    sourceConversationId: undefined,
  };
}

/** Best-effort recovery of the autonomy preset a task's stored policy corresponds to. */
export function inferAutonomy(policy: TaskPolicy): TaskAutonomyPreset {
  return policy.allowedOrigins.length > 0 && policy.preapprovedWriteTools.length > 0
    ? 'sameOriginWrites'
    : 'notify';
}

/** Recover the editable schedule shape from a task's triggers. */
export function inferSchedule(triggers: readonly TaskTrigger[]): {
  preset: SchedulePreset;
  everyMinutes: number;
  selector: string;
  changeMode: TaskPageChangeMode;
} {
  const primary = primaryScheduleTrigger(triggers);
  if (primary?.type === 'pageChange') {
    return {
      preset: 'pageChange',
      everyMinutes: primary.everyMinutes,
      selector: primary.selector ?? '',
      changeMode: primary.changeMode,
    };
  }
  if (primary?.type === 'interval') {
    return {
      preset: primary.everyMinutes <= MIN_TASK_INTERVAL_MINUTES ? 'continuous' : 'interval',
      everyMinutes: primary.everyMinutes,
      selector: '',
      changeMode: 'textHash',
    };
  }
  return { preset: 'interval', everyMinutes: DEFAULT_INTERVAL_MINUTES, selector: '', changeMode: 'textHash' };
}

export function formStateFromTask(task: TaskDefinition): TaskFormState {
  const schedule = inferSchedule(task.triggers);
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    targetUrl: task.targetUrl ?? '',
    preset: schedule.preset,
    everyMinutes: schedule.everyMinutes,
    selector: schedule.selector,
    changeMode: schedule.changeMode,
    autonomy: inferAutonomy(task.policy),
    sourceConversationId: task.sourceConversationId,
  };
}

/** Seed a new-task form from an agent conversation. `existingTaskId` re-converts in place. */
export function formStateFromConversation(input: {
  conversationId: string;
  firstPrompt: string;
  targetUrl?: string | undefined;
  existingTaskId?: string | undefined;
}): TaskFormState {
  return {
    ...blankFormState(),
    id: input.existingTaskId,
    name: deriveTaskName(input.firstPrompt),
    prompt: input.firstPrompt.trim(),
    targetUrl: input.targetUrl ?? '',
    autonomy: 'sameOriginWrites',
    sourceConversationId: input.conversationId,
  };
}

export type FormValidation = { ok: true; input: TaskSaveInput } | { ok: false; error: 'name' | 'prompt' | 'url' };

/** Validate the form and assemble a {@link TaskSaveInput}. Policy is left to the host (via `autonomy`). */
export function buildSaveInput(form: TaskFormState): FormValidation {
  const name = form.name.trim();
  const prompt = form.prompt.trim();
  const targetUrl = form.targetUrl.trim();
  if (name.length === 0) return { ok: false, error: 'name' };
  if (prompt.length === 0) return { ok: false, error: 'prompt' };
  if (targetUrl.length > 0 && !isValidUrl(targetUrl)) return { ok: false, error: 'url' };

  const scheduleTrigger = presetToTrigger(form.preset, {
    everyMinutes: form.everyMinutes,
    ...(targetUrl.length > 0 ? { url: targetUrl } : {}),
    ...(form.selector.trim().length > 0 ? { selector: form.selector } : {}),
    changeMode: form.changeMode,
  });

  return {
    ok: true,
    input: {
      ...(form.id !== undefined ? { id: form.id } : {}),
      name,
      prompt,
      triggers: [{ type: 'manual' }, scheduleTrigger],
      autonomy: form.autonomy,
      ...(targetUrl.length > 0 ? { targetUrl } : {}),
      ...(form.sourceConversationId !== undefined
        ? { sourceConversationId: form.sourceConversationId }
        : {}),
    },
  };
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
