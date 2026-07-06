import { createHash, randomUUID } from 'node:crypto';
import { AppError, Logger } from '@tepegoz/libs';
import {
  defaultTaskPolicy,
  nextIntervalRunAt,
  normalizeTaskTrigger,
  type PageChangeTaskTrigger,
  type TaskArtifactRecord,
  type TaskCommandInput,
  type TaskDefinition,
  type TaskRunRecord,
  type TaskSaveInput,
  type TaskTrigger,
  type TaskTriggerType,
} from '@tepegoz/tasks';
import { EventJournal, TaskStore, type TaskTriggerStateRecord } from '@tepegoz/persistence';
import type { EventType } from '@tepegoz/shared-types';
import { getDb } from '../db/database.electron';
import NotificationHost from '../notifications/notification-host';
import TabManager from '../tabs';

interface QueuedTaskRun {
  task: TaskDefinition;
  trigger: TaskTrigger;
  run: TaskRunRecord;
}

export interface TaskRunLaunchResult {
  ok: boolean;
  summary?: string | undefined;
  error?: string | undefined;
}

export type TaskRunLauncher = (
  task: TaskDefinition,
  run: TaskRunRecord,
  trigger: TaskTrigger,
) => Promise<TaskRunLaunchResult>;

const TICK_MS = 30_000;
const PAGE_CHECK_TIMEOUT_MS = 20_000;
const MAX_BASELINE_PREVIEW = 240;

function now(): number {
  return Date.now();
}

function triggerKey(trigger: TaskTrigger, index: number): string {
  if (trigger.type === 'manual') return `manual:${String(index)}`;
  if (trigger.type === 'interval') return `interval:${String(index)}`;
  if (trigger.type === 'pageChange') return `pageChange:${String(index)}:${trigger.url}`;
  return `external:${trigger.source}:${String(index)}`;
}

function triggerType(trigger: TaskTrigger): TaskTriggerType {
  return trigger.type;
}

function triggerSource(trigger: TaskTrigger): string | undefined {
  if (trigger.type === 'pageChange') return trigger.url;
  if (trigger.type === 'external') return trigger.source;
  return undefined;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function computeNextRunAt(task: TaskDefinition, at: number): number | undefined {
  const times: number[] = [];
  for (const trigger of task.triggers) {
    if (trigger.type === 'interval') {
      const next = nextIntervalRunAt(trigger, at);
      if (next !== null) times.push(next);
    } else if (trigger.type === 'pageChange' && trigger.enabled) {
      times.push(at + trigger.everyMinutes * 60 * 1000);
    }
  }
  if (times.length === 0) return undefined;
  return Math.min(...times);
}

function waitForLoad(tabId: string): Promise<void> {
  const wc = TabManager.webContentsForTab(tabId);
  if (wc === null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', finish);
      resolve();
    }, PAGE_CHECK_TIMEOUT_MS);
    wc.once('did-stop-loading', finish);
  });
}

async function readPageChangeText(trigger: PageChangeTaskTrigger): Promise<{ url: string; text: string }> {
  const tabId = TabManager.createTab(trigger.url, { background: true });
  if (tabId === null) throw new AppError('Page-change watcher tab was blocked', 409);
  try {
    await waitForLoad(tabId);
    const wc = TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) throw new AppError('Watcher tab closed before read', 409);
    const script =
      trigger.selector !== undefined
        ? `(() => document.querySelector(${JSON.stringify(trigger.selector)})?.textContent ?? "")()`
        : 'document.body ? document.body.innerText : ""';
    const raw: unknown = await wc.executeJavaScript(script, true);
    return { url: wc.getURL(), text: typeof raw === 'string' ? raw : '' };
  } finally {
    TabManager.closeTab(tabId);
  }
}

function appendAudit(type: EventType, payload: Record<string, unknown>, correlationId: string): void {
  const db = getDb();
  if (db === null) return;
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type,
      ts: now(),
      actor: 'system',
      correlationId,
      payload,
      redacted: true,
    });
  } catch (err) {
    Logger.warn('Task audit append failed', { err: String(err) });
  }
}

export default class TaskService {
  private static timer: NodeJS.Timeout | null = null;
  private static runner: TaskRunLauncher | null = null;
  private static runningTaskId: string | null = null;
  private static queue = new Map<string, QueuedTaskRun>();

  static init(): void {
    if (TaskService.timer !== null) return;
    TaskService.recomputeNextRuns();
    TaskService.timer = setInterval(() => {
      void TaskService.tick();
    }, TICK_MS);
    void TaskService.tick();
  }

  static stop(): void {
    if (TaskService.timer !== null) clearInterval(TaskService.timer);
    TaskService.timer = null;
    TaskService.queue.clear();
    TaskService.runningTaskId = null;
  }

  static setRunner(runner: TaskRunLauncher | null): void {
    TaskService.runner = runner;
  }

  static list(): TaskDefinition[] {
    const db = getDb();
    return db === null ? [] : TaskStore.list(db);
  }

  static get(id: string): TaskDefinition | null {
    const db = getDb();
    return db === null ? null : TaskStore.get(db, id);
  }

  static save(input: TaskSaveInput): TaskDefinition {
    const db = getDb();
    if (db === null) throw new AppError('Database unavailable', 503);
    const existing = input.id !== undefined ? TaskStore.get(db, input.id) : null;
    const at = now();
    const task: TaskDefinition = {
      id: input.id ?? randomUUID(),
      name: input.name,
      prompt: input.prompt,
      ...(input.description !== undefined ? { description: input.description } : {}),
      status: input.status ?? existing?.status ?? 'enabled',
      triggers: input.triggers.map(normalizeTaskTrigger),
      policy: { ...defaultTaskPolicy(), ...input.policy },
      ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
      ...(input.targetOrigin !== undefined ? { targetOrigin: input.targetOrigin } : {}),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      ...(existing?.lastRunAt !== undefined ? { lastRunAt: existing.lastRunAt } : {}),
    };
    const nextRunAt = computeNextRunAt(task, at);
    TaskStore.upsert(db, nextRunAt === undefined ? task : { ...task, nextRunAt });
    return TaskStore.get(db, task.id) ?? task;
  }

  static delete(id: string): void {
    const db = getDb();
    if (db !== null) TaskStore.delete(db, id);
    TaskService.queue.delete(id);
  }

  static listRuns(taskId?: string): TaskRunRecord[] {
    const db = getDb();
    return db === null ? [] : TaskStore.listRuns(db, taskId);
  }

  static listArtifacts(taskId?: string): TaskArtifactRecord[] {
    const db = getDb();
    return db === null ? [] : TaskStore.listArtifacts(db, taskId);
  }

  static command(input: TaskCommandInput): void {
    const task = TaskService.get(input.id);
    if (task === null) throw new AppError('Task not found', 404);
    if (input.action === 'run') {
      TaskService.enqueue(task, { type: 'manual' });
      return;
    }
    if (input.action === 'cancel') {
      TaskService.queue.delete(input.id);
      return;
    }
    if (input.action === 'archive') {
      TaskService.updateStatus(task, 'archived');
    } else if (input.action === 'enable') {
      TaskService.updateStatus(task, 'enabled');
    } else if (input.action === 'disable') {
      TaskService.updateStatus(task, 'disabled');
    }
  }

  private static updateStatus(task: TaskDefinition, status: TaskDefinition['status']): void {
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
  }

  private static recomputeNextRuns(): void {
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

  private static async tick(): Promise<void> {
    const db = getDb();
    if (db === null) return;
    const at = now();
    for (const task of TaskStore.due(db, at)) {
      await TaskService.evaluateTask(task, at);
    }
    await TaskService.drainQueue();
  }

  private static async evaluateTask(task: TaskDefinition, at: number): Promise<void> {
    for (const [index, trigger] of task.triggers.entries()) {
      if (trigger.type === 'interval' && trigger.enabled && (task.nextRunAt ?? Number.MAX_SAFE_INTEGER) <= at) {
        TaskService.enqueue(task, trigger);
      } else if (trigger.type === 'pageChange' && trigger.enabled) {
        await TaskService.evaluatePageChange(task, trigger, triggerKey(trigger, index), at);
      }
    }
    const db = getDb();
    if (db !== null) {
      const nextRunAt = computeNextRunAt(task, at);
      TaskStore.upsert(db, { ...task, updatedAt: at, ...(nextRunAt !== undefined ? { nextRunAt } : {}) });
    }
  }

  private static async evaluatePageChange(
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
        TaskService.enqueue(task, trigger);
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

  private static enqueue(task: TaskDefinition, trigger: TaskTrigger): void {
    if (TaskService.queue.has(task.id) || TaskService.runningTaskId === task.id) return;
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
    TaskService.queue.set(task.id, { task, trigger, run });
    appendAudit('TaskQueued', {
      taskId: task.id,
      triggerType: run.triggerType,
      triggerSource: run.triggerSource ?? null,
    }, run.correlationId);
  }

  private static async drainQueue(): Promise<void> {
    if (TaskService.runningTaskId !== null) return;
    const entry = TaskService.queue.values().next();
    if (entry.done === true) return;
    const next = entry.value;
    TaskService.queue.delete(next.task.id);
    TaskService.runningTaskId = next.task.id;
    try {
      await TaskService.runQueued(next);
    } finally {
      TaskService.runningTaskId = null;
      if (TaskService.queue.size > 0) void TaskService.drainQueue();
    }
  }

  private static async runQueued(input: QueuedTaskRun): Promise<void> {
    const db = getDb();
    const started: TaskRunRecord = { ...input.run, status: 'running', startedAt: now() };
    if (db !== null) TaskStore.upsertRun(db, started);
    appendAudit('TaskStarted', { taskId: input.task.id, triggerType: started.triggerType }, started.correlationId);
    if (input.task.policy.notifyOnStart) {
      NotificationHost.push({
        source: 'agent',
        kind: 'info',
        title: `Task started: ${input.task.name}`,
        body: input.task.prompt.slice(0, 140),
        channels: ['center', 'toast'],
      });
    }

    const launcher = TaskService.runner;
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
    appendAudit(result.ok ? 'TaskSucceeded' : 'TaskFailed', {
      taskId: input.task.id,
      triggerType: done.triggerType,
      summary: result.summary ?? null,
      error: result.error ?? null,
    }, done.correlationId);
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
}
