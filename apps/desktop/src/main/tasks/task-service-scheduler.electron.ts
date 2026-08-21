import { randomUUID } from 'node:crypto';
import { Logger } from '@tepegoz/libs';
import type {
  PageChangeTaskTrigger,
  TaskDefinition,
  TaskRunRecord,
  TaskTrigger,
} from '@tepegoz/tasks';
import { TaskStore, type TaskTriggerStateRecord } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import NotificationHost from '../notifications/notification-host';
import {
  MAX_BASELINE_PREVIEW,
  TICK_MS,
  appendAudit,
  computeNextRunAt,
  hashText,
  now,
  readPageChangeText,
  triggerKey,
  triggerSource,
  triggerType,
  type QueuedTaskRun,
} from './task-service-support.electron';
import { broadcast, runtime } from './task-service-state.electron';

export function init(): void {
  if (runtime.timer !== null) return;
  recomputeNextRuns();
  runtime.timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

export function stop(): void {
  if (runtime.timer !== null) clearInterval(runtime.timer);
  runtime.timer = null;
  runtime.queue.clear();
  runtime.runningTaskId = null;
}

function recomputeNextRuns(): void {
  const db = getDb();
  if (db === null) return;
  const at = now();
  for (const task of TaskStore.list(db)) {
    if (task.status !== 'enabled') continue;
    const nextRunAt = computeNextRunAt(task, at);
    if (nextRunAt !== undefined && task.nextRunAt === undefined) {
      TaskStore.upsert(db, { ...task, nextRunAt, updatedAt: at });
    }
  }
}

async function tick(): Promise<void> {
  const db = getDb();
  if (db === null) return;
  const at = now();
  for (const task of TaskStore.due(db, at)) {
    await evaluateTask(task, at);
  }
  await drainQueue();
}

async function evaluateTask(task: TaskDefinition, at: number): Promise<void> {
  for (const [index, trigger] of task.triggers.entries()) {
    if (
      trigger.type === 'interval' &&
      trigger.enabled &&
      (task.nextRunAt ?? Number.MAX_SAFE_INTEGER) <= at
    ) {
      enqueue(task, trigger);
    } else if (trigger.type === 'pageChange' && trigger.enabled) {
      await evaluatePageChange(task, trigger, triggerKey(trigger, index), at);
    }
  }
  const db = getDb();
  if (db !== null) {
    const nextRunAt = computeNextRunAt(task, at);
    TaskStore.upsert(db, {
      ...task,
      updatedAt: at,
      ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    });
  }
}

async function evaluatePageChange(
  task: TaskDefinition,
  trigger: PageChangeTaskTrigger,
  key: string,
  at: number,
): Promise<void> {
  const db = getDb();
  if (db === null) return;
  const state = TaskStore.listTriggerState(db, task.id).find((item) => item.triggerKey === key);
  if ((state?.nextCheckAt ?? 0) > at) return;
  const nextCheckAt = at + trigger.everyMinutes * 60 * 1000;
  try {
    const snapshot = await readPageChangeText(trigger);
    const textHash = hashText(`${snapshot.url}\n${snapshot.text}`);
    const preview = snapshot.text.slice(0, MAX_BASELINE_PREVIEW);
    const nextState: TaskTriggerStateRecord = {
      taskId: task.id,
      triggerKey: key,
      lastCheckedAt: at,
      nextCheckAt,
      baselineHash: textHash,
      baselinePreview: preview,
    };
    if (state?.baselineHash !== undefined && state.baselineHash !== textHash) {
      enqueue(task, trigger);
      TaskStore.upsertTriggerState(db, { ...nextState, lastFiredAt: at });
    } else {
      TaskStore.upsertTriggerState(db, nextState);
    }
  } catch (err) {
    TaskStore.upsertTriggerState(db, {
      taskId: task.id,
      triggerKey: key,
      lastCheckedAt: at,
      nextCheckAt,
      error: err instanceof Error ? err.message : String(err),
    });
    Logger.warn('Task page-change check failed', { taskId: task.id, err: String(err) });
  }
}

export function enqueue(task: TaskDefinition, trigger: TaskTrigger): void {
  if (runtime.queue.has(task.id) || runtime.runningTaskId === task.id) return;
  const run: TaskRunRecord = {
    id: randomUUID(),
    taskId: task.id,
    correlationId: `task-${randomUUID()}`,
    triggerType: triggerType(trigger),
    ...(triggerSource(trigger) !== undefined ? { triggerSource: triggerSource(trigger) } : {}),
    status: 'queued',
    queuedAt: now(),
  };
  const db = getDb();
  if (db !== null) TaskStore.upsertRun(db, run);
  runtime.queue.set(task.id, { task, trigger, run });
  broadcast();
  appendAudit(
    'TaskQueued',
    {
      taskId: task.id,
      triggerType: run.triggerType,
      triggerSource: run.triggerSource ?? null,
    },
    run.correlationId,
  );
}

async function drainQueue(): Promise<void> {
  if (runtime.runningTaskId !== null) return;
  const entry = runtime.queue.values().next();
  if (entry.done === true) return;
  const next = entry.value;
  runtime.queue.delete(next.task.id);
  runtime.runningTaskId = next.task.id;
  try {
    await runQueued(next);
  } finally {
    runtime.runningTaskId = null;
    if (runtime.queue.size > 0) void drainQueue();
  }
}

async function runQueued(input: QueuedTaskRun): Promise<void> {
  const db = getDb();
  const started: TaskRunRecord = { ...input.run, status: 'running', startedAt: now() };
  if (db !== null) TaskStore.upsertRun(db, started);
  broadcast();
  appendAudit(
    'TaskStarted',
    { taskId: input.task.id, triggerType: started.triggerType },
    started.correlationId,
  );
  if (input.task.policy.notifyOnStart) {
    NotificationHost.push({
      source: 'agent',
      kind: 'info',
      title: `Task started: ${input.task.name}`,
      body: input.task.prompt.slice(0, 140),
      channels: ['center', 'toast'],
    });
  }

  const launcher = runtime.runner;
  const result =
    launcher === null
      ? { ok: false, error: 'Task runner is not attached yet' }
      : await launcher(input.task, started, input.trigger);
  const completedAt = now();
  const done: TaskRunRecord = {
    ...started,
    status: result.ok ? 'succeeded' : 'failed',
    completedAt,
    ...(result.summary !== undefined ? { summary: result.summary } : {}),
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
  if (db !== null) {
    TaskStore.upsertRun(db, done);
    TaskStore.upsert(db, { ...input.task, lastRunAt: completedAt, updatedAt: completedAt });
  }
  broadcast();
  appendAudit(
    result.ok ? 'TaskSucceeded' : 'TaskFailed',
    {
      taskId: input.task.id,
      triggerType: done.triggerType,
      summary: result.summary ?? null,
      error: result.error ?? null,
    },
    done.correlationId,
  );
  const shouldNotify = result.ok ? input.task.policy.notifyOnDone : input.task.policy.notifyOnError;
  if (shouldNotify) {
    NotificationHost.push({
      source: 'agent',
      kind: result.ok ? 'info' : 'error',
      title: result.ok ? `Task done: ${input.task.name}` : `Task failed: ${input.task.name}`,
      body: result.summary ?? result.error ?? input.task.prompt.slice(0, 140),
      channels: ['center', 'toast', 'native'],
    });
  }
}
