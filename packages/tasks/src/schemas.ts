import { z } from 'zod';
import {
  MIN_TASK_INTERVAL_MINUTES,
  TASK_COMMAND_ACTIONS,
  TASK_EXTERNAL_SOURCES,
  TASK_PAGE_CHANGE_MODES,
  TASK_RUN_STATUSES,
  TASK_STATUSES,
  type TaskArtifactRecord,
  type TaskCommandInput,
  type TaskDefinition,
  type TaskPolicy,
  type TaskRunRecord,
  type TaskSaveInput,
  type TaskTrigger,
} from './index';

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TaskRunStatusSchema = z.enum(TASK_RUN_STATUSES);
export const TaskCommandActionSchema = z.enum(TASK_COMMAND_ACTIONS);
export const TaskExternalSourceSchema = z.enum(TASK_EXTERNAL_SOURCES);
export const TaskPageChangeModeSchema = z.enum(TASK_PAGE_CHANGE_MODES);

export const TaskPolicySchema = z.object({
  allowedOrigins: z.array(z.string().min(1).max(2048)).max(50),
  allowedReadTools: z.array(z.string().min(1).max(128)).max(200),
  preapprovedWriteTools: z.array(z.string().min(1).max(128)).max(200),
  maxRunDurationMs: z.number().int().min(30_000).max(6 * 60 * 60 * 1000),
  cooldownMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  notifyOnStart: z.boolean(),
  notifyOnDone: z.boolean(),
  notifyOnError: z.boolean(),
}) satisfies z.ZodType<TaskPolicy>;

const ManualTriggerSchema = z.object({ type: z.literal('manual') });

const IntervalTriggerSchema = z.object({
  type: z.literal('interval'),
  enabled: z.boolean(),
  everyMinutes: z.number().int().min(MIN_TASK_INTERVAL_MINUTES).max(60 * 24 * 30),
  startAt: z.number().int().nonnegative().optional(),
});

const PageChangeTriggerSchema = z.object({
  type: z.literal('pageChange'),
  enabled: z.boolean(),
  url: z.string().min(1).max(4096),
  selector: z.string().min(1).max(1024).optional(),
  everyMinutes: z.number().int().min(MIN_TASK_INTERVAL_MINUTES).max(60 * 24 * 30),
  changeMode: TaskPageChangeModeSchema,
  fireOnFirstCheck: z.literal(false),
});

const ExternalTriggerSchema = z.object({
  type: z.literal('external'),
  source: TaskExternalSourceSchema,
  enabled: z.literal(false),
});

export const TaskTriggerSchema = z.discriminatedUnion('type', [
  ManualTriggerSchema,
  IntervalTriggerSchema,
  PageChangeTriggerSchema,
  ExternalTriggerSchema,
]) satisfies z.ZodType<TaskTrigger>;

export const TaskDefinitionSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(8000),
  description: z.string().max(2048).optional(),
  status: TaskStatusSchema,
  triggers: z.array(TaskTriggerSchema).min(1).max(20),
  policy: TaskPolicySchema,
  targetUrl: z.string().max(4096).optional(),
  targetOrigin: z.string().max(2048).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastRunAt: z.number().int().nonnegative().optional(),
  nextRunAt: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<TaskDefinition>;

export const TaskSaveInputSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(8000),
  description: z.string().max(2048).optional(),
  status: TaskStatusSchema.optional(),
  triggers: z.array(TaskTriggerSchema).min(1).max(20),
  policy: TaskPolicySchema,
  targetUrl: z.string().max(4096).optional(),
  targetOrigin: z.string().max(2048).optional(),
}) satisfies z.ZodType<TaskSaveInput>;

export const TaskCommandInputSchema = z.object({
  id: z.string().min(1).max(128),
  action: TaskCommandActionSchema,
  idempotencyKey: z.string().min(1).max(128).optional(),
}) satisfies z.ZodType<TaskCommandInput>;

export const TaskRunRecordSchema = z.object({
  id: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
  correlationId: z.string().min(1).max(128),
  triggerType: z.enum(['manual', 'interval', 'pageChange', 'external']),
  triggerSource: z.string().max(128).optional(),
  status: TaskRunStatusSchema,
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
  queuedAt: z.number().int().nonnegative(),
  summary: z.string().max(4096).optional(),
  error: z.string().max(4096).optional(),
}) satisfies z.ZodType<TaskRunRecord>;

export const TaskArtifactRecordSchema = z.object({
  id: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
  runId: z.string().min(1).max(128),
  kind: z.enum(['text', 'file', 'blob', 'link']),
  title: z.string().min(1).max(256),
  summary: z.string().max(2048).optional(),
  mimeType: z.string().max(256).optional(),
  blobRef: z.string().regex(/^cas:\/\/[a-f0-9]{64}$/).optional(),
  path: z.string().max(4096).optional(),
  url: z.string().max(4096).optional(),
  createdAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<TaskArtifactRecord>;
