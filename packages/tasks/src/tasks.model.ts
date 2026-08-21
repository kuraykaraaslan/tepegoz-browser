/**
 * The tasks domain model: statuses, triggers, policy, and the pure state selectors over them.
 *
 * Lives here rather than in `index.ts` so the package entry can be a PURE barrel. It was not: `index.ts`
 * defined the model AND re-exported `./conversion`, while `conversion.ts` imported the model back out of
 * `./index` — a genuine import cycle that `no-circular` flags. Internal modules import this file; only
 * consumers outside the package go through the barrel.
 */
export const TASK_STATUSES = ['enabled', 'disabled', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'canceled',
] as const;
export type TaskRunStatus = (typeof TASK_RUN_STATUSES)[number];

export const TASK_TRIGGER_TYPES = ['manual', 'interval', 'pageChange', 'external'] as const;
export type TaskTriggerType = (typeof TASK_TRIGGER_TYPES)[number];

export const TASK_EXTERNAL_SOURCES = ['telegram', 'webhook'] as const;
export type TaskExternalSource = (typeof TASK_EXTERNAL_SOURCES)[number];

export const TASK_PAGE_CHANGE_MODES = ['textHash', 'elementText'] as const;
export type TaskPageChangeMode = (typeof TASK_PAGE_CHANGE_MODES)[number];

export const TASK_COMMAND_ACTIONS = ['run', 'cancel', 'enable', 'disable', 'archive'] as const;
export type TaskCommandAction = (typeof TASK_COMMAND_ACTIONS)[number];

/**
 * High-level autonomy preset for a saved task. The host synthesizes a concrete {@link TaskPolicy} from
 * this at save time (the renderer never sees the tool allowlist). Enforcement is origin-scoped:
 * `notify` pauses on every write; `sameOriginWrites` pre-approves the browser write tools on the task's
 * own target origin only (mirrors the interactive agent's "act" autonomy, still origin-bounded). Broader
 * autonomy is expressed by editing the policy directly, not via a preset.
 */
export const TASK_AUTONOMY_PRESETS = ['notify', 'sameOriginWrites'] as const;
export type TaskAutonomyPreset = (typeof TASK_AUTONOMY_PRESETS)[number];

export const MIN_TASK_INTERVAL_MINUTES = 5;
export const DEFAULT_TASK_MAX_RUN_MS = 10 * 60 * 1000;
export const DEFAULT_TASK_COOLDOWN_MS = 15 * 60 * 1000;

export interface ManualTaskTrigger {
  type: 'manual';
}

export interface IntervalTaskTrigger {
  type: 'interval';
  enabled: boolean;
  everyMinutes: number;
  startAt?: number | undefined;
}

export interface PageChangeTaskTrigger {
  type: 'pageChange';
  enabled: boolean;
  url: string;
  selector?: string | undefined;
  everyMinutes: number;
  changeMode: TaskPageChangeMode;
  fireOnFirstCheck: false;
}

export interface ExternalTaskTrigger {
  type: 'external';
  source: TaskExternalSource;
  enabled: false;
}

export type TaskTrigger =
  ManualTaskTrigger | IntervalTaskTrigger | PageChangeTaskTrigger | ExternalTaskTrigger;

export interface TaskPolicy {
  allowedOrigins: string[];
  allowedReadTools: string[];
  preapprovedWriteTools: string[];
  maxRunDurationMs: number;
  cooldownMs: number;
  notifyOnStart: boolean;
  notifyOnDone: boolean;
  notifyOnError: boolean;
}

export interface TaskDefinition {
  id: string;
  name: string;
  prompt: string;
  description?: string | undefined;
  status: TaskStatus;
  triggers: TaskTrigger[];
  policy: TaskPolicy;
  targetUrl?: string | undefined;
  targetOrigin?: string | undefined;
  /** The agent conversation this task was converted from, if any (traceability + re-convert-in-place). */
  sourceConversationId?: string | undefined;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number | undefined;
  nextRunAt?: number | undefined;
}

export interface TaskRunRecord {
  id: string;
  taskId: string;
  correlationId: string;
  triggerType: TaskTriggerType;
  triggerSource?: string | undefined;
  status: TaskRunStatus;
  startedAt?: number | undefined;
  completedAt?: number | undefined;
  queuedAt: number;
  summary?: string | undefined;
  error?: string | undefined;
}

export interface TaskArtifactRecord {
  id: string;
  taskId: string;
  runId: string;
  kind: 'text' | 'file' | 'blob' | 'link';
  title: string;
  summary?: string | undefined;
  mimeType?: string | undefined;
  blobRef?: string | undefined;
  path?: string | undefined;
  url?: string | undefined;
  createdAt: number;
}

export interface TasksState {
  tasks: TaskDefinition[];
  runs: TaskRunRecord[];
  artifacts: TaskArtifactRecord[];
}

export interface TaskSaveInput {
  id?: string | undefined;
  name: string;
  prompt: string;
  description?: string | undefined;
  status?: TaskStatus | undefined;
  triggers: TaskTrigger[];
  /**
   * The concrete policy to store. Optional: when omitted, the host synthesizes one from {@link autonomy}
   * (needs the live tool registry, so only the main process can do it). Provide this to store an explicit,
   * hand-crafted policy (advanced editor).
   */
  policy?: TaskPolicy | undefined;
  /** Autonomy preset the host uses to synthesize {@link policy} when the latter is omitted. */
  autonomy?: TaskAutonomyPreset | undefined;
  targetUrl?: string | undefined;
  targetOrigin?: string | undefined;
  sourceConversationId?: string | undefined;
}

export interface TaskCommandInput {
  id: string;
  action: TaskCommandAction;
  idempotencyKey?: string | undefined;
}

export interface TaskRunNowInput {
  id: string;
  idempotencyKey?: string | undefined;
}

export interface TaskStatePatch {
  id: string;
  patch: Partial<Omit<TaskDefinition, 'id' | 'createdAt'>>;
}

export function defaultTaskPolicy(): TaskPolicy {
  return {
    allowedOrigins: [],
    allowedReadTools: [],
    preapprovedWriteTools: [],
    maxRunDurationMs: DEFAULT_TASK_MAX_RUN_MS,
    cooldownMs: DEFAULT_TASK_COOLDOWN_MS,
    notifyOnStart: true,
    notifyOnDone: true,
    notifyOnError: true,
  };
}

export function emptyTasksState(): TasksState {
  return { tasks: [], runs: [], artifacts: [] };
}

export function normalizeIntervalMinutes(value: number): number {
  return Math.max(MIN_TASK_INTERVAL_MINUTES, Math.trunc(value));
}

export function normalizeTaskTrigger(trigger: TaskTrigger): TaskTrigger {
  if (trigger.type === 'interval') {
    return { ...trigger, everyMinutes: normalizeIntervalMinutes(trigger.everyMinutes) };
  }
  if (trigger.type === 'pageChange') {
    return {
      ...trigger,
      everyMinutes: normalizeIntervalMinutes(trigger.everyMinutes),
      fireOnFirstCheck: false,
    };
  }
  if (trigger.type === 'external') return { ...trigger, enabled: false };
  return trigger;
}

export function nextIntervalRunAt(trigger: IntervalTaskTrigger, now: number): number | null {
  if (!trigger.enabled) return null;
  const intervalMs = normalizeIntervalMinutes(trigger.everyMinutes) * 60 * 1000;
  const start = trigger.startAt ?? now;
  if (start > now) return start;
  const elapsed = now - start;
  return start + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
}

export function upsertTask(state: TasksState, task: TaskDefinition): TasksState {
  const index = state.tasks.findIndex((item) => item.id === task.id);
  if (index === -1) return { ...state, tasks: [task, ...state.tasks] };
  const tasks = state.tasks.slice();
  tasks[index] = task;
  return { ...state, tasks };
}

export function patchTask(state: TasksState, input: TaskStatePatch): TasksState {
  const current = state.tasks.find((item) => item.id === input.id);
  if (current === undefined) return state;
  return upsertTask(state, {
    ...current,
    ...input.patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: input.patch.updatedAt ?? Date.now(),
  });
}

export function removeTask(state: TasksState, id: string): TasksState {
  return {
    ...state,
    tasks: state.tasks.filter((item) => item.id !== id),
  };
}

export function upsertTaskRun(state: TasksState, run: TaskRunRecord): TasksState {
  const index = state.runs.findIndex((item) => item.id === run.id);
  if (index === -1) return { ...state, runs: [run, ...state.runs] };
  const runs = state.runs.slice();
  runs[index] = run;
  return { ...state, runs };
}

export function addTaskArtifact(state: TasksState, artifact: TaskArtifactRecord): TasksState {
  return { ...state, artifacts: [artifact, ...state.artifacts] };
}

export function getTask(state: TasksState, id: string): TaskDefinition | undefined {
  return state.tasks.find((item) => item.id === id);
}

export function listTaskRuns(state: TasksState, taskId?: string): TaskRunRecord[] {
  return taskId === undefined ? state.runs : state.runs.filter((run) => run.taskId === taskId);
}

export function listTaskArtifacts(state: TasksState, taskId?: string): TaskArtifactRecord[] {
  return taskId === undefined
    ? state.artifacts
    : state.artifacts.filter((artifact) => artifact.taskId === taskId);
}

export function taskCanUseTool(
  policy: TaskPolicy,
  toolId: string,
  danger: 'read' | 'write',
): boolean {
  if (danger === 'read') return policy.allowedReadTools.includes(toolId);
  return policy.preapprovedWriteTools.includes(toolId);
}
