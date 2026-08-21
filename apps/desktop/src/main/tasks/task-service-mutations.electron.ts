import { randomUUID } from 'node:crypto';
import { AppError } from '@tepegoz/libs';
import {
  normalizeTaskTrigger,
  originOf,
  synthesizePolicy,
  type TaskCommandInput,
  type TaskDefinition,
  type TaskSaveInput,
} from '@tepegoz/tasks';
import { TaskStore } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import { computeNextRunAt, now, type TaskRunLauncher } from './task-service-support.electron';
import { broadcast, getTask, runtime } from './task-service-state.electron';
import { enqueue } from './task-service-scheduler.electron';

export function setRunner(runner: TaskRunLauncher | null): void {
  runtime.runner = runner;
}

/**
 * Inject a provider that lists the write-class tool ids the agent can currently run. Used to synthesize
 * a task's {@link TaskPolicy} from its autonomy preset at save time — kept out of `@tepegoz/tasks` so the
 * package stays free of a hard capability-plane dependency (mirrors {@link setRunner}).
 */
export function setWriteToolIdsProvider(provider: (() => string[]) | null): void {
  runtime.writeToolIdsProvider = provider;
}

export function saveTask(input: TaskSaveInput): TaskDefinition {
  const db = getDb();
  if (db === null) throw new AppError('Database unavailable', 503, 'databaseUnavailable');
  const existing = input.id !== undefined ? TaskStore.get(db, input.id) : null;
  const at = now();
  const targetOrigin = input.targetOrigin ?? originOf(input.targetUrl);
  // Prefer an explicit hand-crafted policy; otherwise synthesize one from the autonomy preset using the
  // live write-tool set (the renderer never sees the tool allowlist — trust boundary stays in main).
  const policy =
    input.policy ??
    synthesizePolicy(input.autonomy ?? 'notify', {
      ...(targetOrigin !== undefined ? { targetOrigin } : {}),
      writeToolIds: runtime.writeToolIdsProvider?.() ?? [],
    });
  const task: TaskDefinition = {
    id: input.id ?? randomUUID(),
    name: input.name,
    prompt: input.prompt,
    ...(input.description !== undefined ? { description: input.description } : {}),
    status: input.status ?? existing?.status ?? 'enabled',
    triggers: input.triggers.map(normalizeTaskTrigger),
    policy,
    ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
    ...(targetOrigin !== undefined ? { targetOrigin } : {}),
    ...(input.sourceConversationId !== undefined
      ? { sourceConversationId: input.sourceConversationId }
      : existing?.sourceConversationId !== undefined
        ? { sourceConversationId: existing.sourceConversationId }
        : {}),
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    ...(existing?.lastRunAt !== undefined ? { lastRunAt: existing.lastRunAt } : {}),
  };
  const nextRunAt = computeNextRunAt(task, at);
  TaskStore.upsert(db, nextRunAt === undefined ? task : { ...task, nextRunAt });
  const saved = TaskStore.get(db, task.id) ?? task;
  broadcast();
  return saved;
}

export function deleteTask(id: string): void {
  const db = getDb();
  if (db !== null) TaskStore.delete(db, id);
  runtime.queue.delete(id);
  broadcast();
}

export function runCommand(input: TaskCommandInput): void {
  const task = getTask(input.id);
  if (task === null) throw new AppError('Task not found', 404, 'taskNotFound');
  if (input.action === 'run') {
    enqueue(task, { type: 'manual' });
    return;
  }
  if (input.action === 'cancel') {
    runtime.queue.delete(input.id);
    broadcast();
    return;
  }
  if (input.action === 'archive') {
    updateStatus(task, 'archived');
  } else if (input.action === 'enable') {
    updateStatus(task, 'enabled');
  } else if (input.action === 'disable') {
    updateStatus(task, 'disabled');
  }
}

function updateStatus(task: TaskDefinition, status: TaskDefinition['status']): void {
  const db = getDb();
  if (db === null) return;
  const at = now();
  const next: TaskDefinition = {
    ...task,
    status,
    updatedAt: at,
  };
  const nextRunAt = status === 'enabled' ? computeNextRunAt(next, at) : undefined;
  TaskStore.upsert(db, nextRunAt === undefined ? next : { ...next, nextRunAt });
  broadcast();
}
