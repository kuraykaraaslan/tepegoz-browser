import { createHash, randomUUID } from 'node:crypto';
import { AppError, Logger } from '@tepegoz/libs';
import {
  nextIntervalRunAt,
  type PageChangeTaskTrigger,
  type TaskDefinition,
  type TaskRunRecord,
  type TaskTrigger,
  type TaskTriggerType,
} from '@tepegoz/tasks';
import { EventJournal } from '@tepegoz/persistence';
import type { EventType } from '@tepegoz/shared-types';
import { getDb } from '../db/database.electron';
import TabManager from '../tabs';

export interface QueuedTaskRun {
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

export const TICK_MS = 30_000;
export const PAGE_CHECK_TIMEOUT_MS = 20_000;
export const MAX_BASELINE_PREVIEW = 240;

export function now(): number {
  return Date.now();
}

export function triggerKey(trigger: TaskTrigger, index: number): string {
  if (trigger.type === 'manual') return `manual:${String(index)}`;
  if (trigger.type === 'interval') return `interval:${String(index)}`;
  if (trigger.type === 'pageChange') return `pageChange:${String(index)}:${trigger.url}`;
  return `external:${trigger.source}:${String(index)}`;
}

export function triggerType(trigger: TaskTrigger): TaskTriggerType {
  return trigger.type;
}

export function triggerSource(trigger: TaskTrigger): string | undefined {
  if (trigger.type === 'pageChange') return trigger.url;
  if (trigger.type === 'external') return trigger.source;
  return undefined;
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function computeNextRunAt(task: TaskDefinition, at: number): number | undefined {
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

export async function readPageChangeText(
  trigger: PageChangeTaskTrigger,
): Promise<{ url: string; text: string }> {
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

export function appendAudit(
  type: EventType,
  payload: Record<string, unknown>,
  correlationId: string,
): void {
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
