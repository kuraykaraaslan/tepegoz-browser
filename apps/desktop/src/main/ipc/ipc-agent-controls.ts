import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import {
  AgentApprovalResponseSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentSteerSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { EventJournal } from '@tepegoz/persistence';
import { holdCheckpoint, resumeCheckpoint, type AgentRunCheckpoint } from '@tepegoz/agent-runtime';
import { randomUUID } from 'node:crypto';
import { emitRunEvent } from '../agent/browser-host.electron';
import {
  agentRunControl,
  pauseAgentRun,
  resumeAgentRun,
  steerAgentRun,
} from '../agent/agent-run-lock.electron';
import { getDb } from '../db/database.electron';
import { onAction } from './ipc-helpers';
import { pendingApprovals, pendingPlans, settleApproval, settlePlan } from '../agent/hitl-registry';

/** Register run-control (cancel/pause/resume/steer) + HITL response handlers. */
export function registerAgentControlIpc(): void {
  onAction(IpcChannels.agentCancel, AgentRunIdSchema, (runId) => {
    agentRunControl(runId)?.abort();
    // Unblock a run parked on a pending HITL prompt so cancel takes effect immediately (not after the
    // 120s fail-safe): reject its plan/approval promises now.
    for (const [id, entry] of pendingApprovals) {
      if (entry.runId === runId) {
        pendingApprovals.delete(id);
        entry.resolve({ approved: false, remember: false, grantScope: false });
      }
    }
    for (const [id, entry] of pendingPlans) {
      if (entry.runId === runId) {
        pendingPlans.delete(id);
        entry.resolve({ approved: false });
      }
    }
  });

  // Durable hold/resume record — mirrors the run handler's onCheckpoint (redact → Journal). Best-effort.
  const journalRunCheckpoint = (runId: string, cp: AgentRunCheckpoint): void => {
    const db = getDb();
    if (db === null) return;
    let payload: unknown = cp;
    try {
      payload = JSON.parse(Logger.redact(JSON.stringify(cp)));
    } catch {
      payload = cp;
    }
    try {
      EventJournal.append(db, {
        id: randomUUID(),
        type: 'CheckpointWritten',
        ts: Date.now(),
        actor: 'agent',
        correlationId: runId,
        payload,
        redacted: true,
      });
    } catch (err) {
      Logger.warn('Journal hold/resume checkpoint append failed', { err: String(err) });
    }
  };

  // Run-control: pause/resume HOLD the loop between steps (not cancel); steer INJECTS a message into the
  // running agent. The panel labels 'paused'/'resumed' from its own dict, so no main-process UI string.
  onAction(IpcChannels.agentPause, AgentRunIdSchema, (runId) => {
    pauseAgentRun(runId);
    emitRunEvent(runId, 'paused', 'paused');
    journalRunCheckpoint(runId, holdCheckpoint('user'));
  });
  onAction(IpcChannels.agentResume, AgentRunIdSchema, (runId) => {
    resumeAgentRun(runId);
    emitRunEvent(runId, 'resumed', 'resumed');
    journalRunCheckpoint(runId, resumeCheckpoint());
  });
  onAction(IpcChannels.agentSteer, AgentSteerSchema, ({ runId, text }) => {
    steerAgentRun(runId, text);
    emitRunEvent(runId, 'steered', text);
  });

  // HITL responses are RELAYED by the renderer, never decided by it: the autonomy level is read in
  // main (see `requestApproval` in ipc-agent-run.ts), and a response is applied only if it correlates
  // to a request main actually minted. `onAction` has already `safeParse`d the payload; `settle*`
  // rejects (and logs) anything uncorrelated.
  onAction(
    IpcChannels.agentApprovalResponse,
    AgentApprovalResponseSchema,
    ({ approvalId, approved, remember, grantScope }) => {
      settleApproval(approvalId, approved, remember ?? false, grantScope ?? false);
    },
  );
  onAction(
    IpcChannels.agentPlanResponse,
    AgentPlanResponseSchema,
    ({ planId, approved, skipStepIds }) => {
      settlePlan(planId, approved, skipStepIds);
    },
  );
}
