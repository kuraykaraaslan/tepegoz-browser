import { randomUUID } from 'node:crypto';
import { AppError, Logger } from '@tepegoz/libs';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { isExtensionEnabled, type AgentEventKind } from '@tepegoz/desktop-ipc';
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import {
  taskCanUseTool,
  type TaskDefinition,
  type TaskRunRecord,
  type TaskTrigger,
} from '@tepegoz/tasks';
import { EventJournal } from '@tepegoz/persistence';
import type { EventType } from '@tepegoz/shared-types';
import PreferenceStore from '@tepegoz/preferences';
import { TokenLedger } from '@tepegoz/model-gateway';
import AgentService from './agent-service.electron';
import NotificationHost from '../notifications/notification-host';
import { getDb } from '../db/database.electron';
import {
  registerAgentRunController,
  unregisterAgentRunController,
} from './agent-run-lock.electron';
import { registerHeadlessRun, releaseAgentRun, withAgentRunScope } from './browser-host.electron';
import { agentRunByGroup } from '../ipc/ipc-agent-shared';
import type { TaskRunLaunchResult } from '../tasks/task-service.electron';

const JOURNAL_TYPE_BY_KIND: Partial<Record<AgentEventKind, EventType>> = {
  step_start: 'AgentStepExecuted',
  step_ok: 'AgentStepExecuted',
  step_error: 'AgentStepExecuted',
  awaiting_approval: 'TaskAwaitingApproval',
  handoff: 'HandoffRequested',
  done: 'TaskSucceeded',
  error: 'TaskFailed',
};

function agentEnabled(): boolean {
  return isExtensionEnabled(PreferenceStore.getAll().extensions, agentManifest.id);
}

function appendEvent(
  type: EventType,
  correlationId: string,
  payload: Record<string, unknown>,
): void {
  const db = getDb();
  if (db === null) return;
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type,
      ts: Date.now(),
      actor: 'agent',
      correlationId,
      payload,
      redacted: true,
    });
  } catch (err) {
    Logger.warn('Background task journal append failed', { err: String(err) });
  }
}

function originOf(url: string | undefined): string | null {
  if (url === undefined || url.length === 0) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function taskPolicyPreapproves(task: TaskDefinition, req: ConfirmRequest): boolean {
  if (!taskCanUseTool(task.policy, req.toolName, 'write')) return false;
  const targetOrigin = originOf(req.targetUrl ?? task.targetUrl);
  if (targetOrigin === null) return false;
  return task.policy.allowedOrigins.includes(targetOrigin);
}

export async function runTaskAgent(
  task: TaskDefinition,
  run: TaskRunRecord,
  trigger: TaskTrigger,
): Promise<TaskRunLaunchResult> {
  if (!agentEnabled()) return { ok: false, error: 'Agent extension is disabled' };

  const controller = new AbortController();
  registerAgentRunController(run.correlationId, controller);
  const groupId = `task-${task.id.slice(0, 48)}`;
  if (agentRunByGroup.get(groupId) === true) {
    unregisterAgentRunController(run.correlationId);
    return { ok: false, error: 'This task is already running' };
  }
  agentRunByGroup.set(groupId, true);
  // An unattended task gets its own working-tab latch and group, or it would drive whatever tab the
  // user happens to be looking at — and, with concurrency, fight an interactive run for it.
  registerHeadlessRun(run.correlationId, groupId);
  const prompt =
    `${task.prompt}\n\n` +
    `Saved task context:\n` +
    `- taskId: ${task.id}\n` +
    `- trigger: ${trigger.type}\n` +
    `- targetUrl: ${task.targetUrl ?? '(none)'}`;

  try {
    const summary = await withAgentRunScope(run.correlationId, () =>
      TokenLedger.runScoped(() =>
        AgentService.run(
          prompt,
          {
            signal: controller.signal,
            onEvent: (kind, message, detail) => {
              const eventType = JOURNAL_TYPE_BY_KIND[kind];
              if (eventType !== undefined) {
                appendEvent(eventType, run.correlationId, {
                  kind,
                  taskId: task.id,
                  message: Logger.redact(message),
                  ...(detail !== undefined ? { detail: Logger.redact(detail) } : {}),
                });
              }
              if (kind === 'handoff' || kind === 'awaiting_approval') {
                NotificationHost.push({
                  source: 'agent',
                  kind: 'warning',
                  title: kind === 'handoff' ? 'Task needs handoff' : 'Task needs approval',
                  body: message,
                  channels: ['center', 'toast', 'native'],
                });
              }
            },
            onCheckpoint: (checkpoint) => {
              appendEvent('CheckpointWritten', run.correlationId, { taskId: task.id, checkpoint });
            },
            requestPlanApproval: () => Promise.resolve({ approved: true }),
            requestApproval: (req: ConfirmRequest) => {
              if (taskPolicyPreapproves(task, req)) {
                appendEvent('AgentStepExecuted', run.correlationId, {
                  taskId: task.id,
                  toolName: req.toolName,
                  decision: 'preapproved',
                  origin: originOf(req.targetUrl ?? task.targetUrl),
                });
                return Promise.resolve(true);
              }
              appendEvent('TaskAwaitingApproval', run.correlationId, {
                taskId: task.id,
                toolName: req.toolName,
                reason: req.policy.reason,
              });
              NotificationHost.push({
                source: 'agent',
                kind: 'warning',
                title: 'Task paused for approval',
                body: `${req.toolName}: ${req.policy.reason}`,
                channels: ['center', 'toast', 'native'],
              });
              return Promise.resolve(false);
            },
          },
          groupId,
        ),
      ),
    );
    return {
      ok: summary.ok,
      ...(summary.summary !== undefined ? { summary: summary.summary } : {}),
      ...(!summary.ok ? { error: summary.stoppedReason } : {}),
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    unregisterAgentRunController(run.correlationId);
    releaseAgentRun(run.correlationId);
    agentRunByGroup.delete(groupId);
  }
}
