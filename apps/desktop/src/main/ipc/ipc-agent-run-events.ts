import { Logger } from '@tepegoz/libs';
import { IpcChannels, type AgentEvent, type AgentEventKind } from '@tepegoz/desktop-ipc';
import { AgentDeltaSchema, MAX_DELTA_TEXT } from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import AgentService from '../agent/agent-service.electron';
import {
  sampleRunResource,
  startRunResourceTracking,
} from '../agent/run-resource-tracker.electron';
import { getDb } from '../db/database.electron';
import { appendChainedEvent } from '../notary/chained-journal';
import { mainStrings } from '../lib/i18n-main';
import NotificationHost from '../notifications/notification-host';
import {
  broadcastConversationsState,
  isHistoryKind,
  JOURNAL_TYPE_BY_KIND,
} from './ipc-agent-shared';

/**
 * Per-run event plumbing for `agent:run` (see `ipc-agent-run.ts`): the sender-bound event push, the
 * streamed model-delta channel, the journal/history/notification projection of every agent event and the
 * checkpoint journal write. Everything here closes over one run's identity and writes only to that run's
 * own sender.
 */

/** Push one event to the run's sender; a destroyed sender drops it. */
export function createSendEvent(sender: WebContents): (e: AgentEvent) => void {
  return (e: AgentEvent): void => {
    if (!sender.isDestroyed()) sender.send(IpcChannels.agentEvent, e);
  };
}

export interface RunEventsContext {
  runId: string;
  groupId: string;
  sender: WebContents;
  sendEvent: (e: AgentEvent) => void;
  historyDb: ReturnType<typeof getDb>;
  history: ReturnType<typeof AgentService.beginHistoryTurn> | null;
  resourceState: ReturnType<typeof startRunResourceTracking>;
  /** When the run started — the first streamed fragment reports how long the user waited for it. */
  runStartedAt: number;
}

export interface RunEvents {
  onEvent: (kind: AgentEventKind, message: string, detail?: string) => void;
  onModelDelta: (text: string) => void;
  onCheckpoint: NonNullable<Parameters<typeof AgentService.run>[1]['onCheckpoint']>;
}

export function createRunEvents(ctx: RunEventsContext): RunEvents {
  const { runId, groupId, sender, sendEvent, historyDb, history, resourceState, runStartedAt } =
    ctx;
  /**
   * Streamed model fragments (ADR-0025). Deliberately its own channel, not `agentEvent`: a delta is
   * UNSETTLED model output, so unlike every event above it is never journaled, never written to
   * conversation history, and never replayed. It exists only so the panel can show that work is
   * happening before the step settles.
   */
  // The FIRST fragment carries how long the user waited for it — the time-to-first-feedback
  // measurement (S8). Only the first: paying for the metric on every token would be measuring
  // something that by definition happens once.
  let sentFirstDelta = false;
  const onModelDelta = (text: string): void => {
    if (sender.isDestroyed()) return;
    const payload = {
      runId,
      groupId,
      text: text.slice(0, MAX_DELTA_TEXT),
      ...(sentFirstDelta ? {} : { firstFeedbackMs: Date.now() - runStartedAt }),
    };
    // Validated on the way OUT as well as the way in. The sender is trusted; the model text it
    // carries is not, and a fragment that cannot satisfy its own schema is one the renderer should
    // never be asked to render.
    const parsed = AgentDeltaSchema.safeParse(payload);
    if (!parsed.success) return;
    sentFirstDelta = true;
    sender.send(IpcChannels.agentDelta, parsed.data);
  };
  // Sample on step transitions only — bounded by how many steps the run actually takes, not a timer.
  // 'done'/'error' catch the terminal sample so the run's very last state is reflected, not only its
  // last step.
  const RESOURCE_SAMPLE_KINDS = new Set<AgentEventKind>([
    'step_start',
    'step_ok',
    'step_error',
    'done',
    'error',
  ]);
  const onEvent = (kind: AgentEventKind, message: string, detail?: string): void => {
    if (RESOURCE_SAMPLE_KINDS.has(kind)) sampleRunResource(resourceState);
    sendEvent({
      runId,
      groupId,
      kind,
      message,
      ts: Date.now(),
      ...(detail !== undefined ? { detail } : {}),
    });
    if (historyDb !== null && history !== null && isHistoryKind(kind)) {
      AgentService.appendHistoryEvent(historyDb, history.turnId, {
        runId,
        groupId,
        kind,
        message,
        ...(detail !== undefined ? { detail } : {}),
        ts: Date.now(),
      });
      broadcastConversationsState();
    }
    // Project agent events into the Event Journal (append-only audit; DoD "→ Event Journal"), CHAINED
    // (Phase 7 NotaryService — the agent-run journaling path is the first call site wired onto
    // appendChainedEvent; other domains still append unchained, see that function's scope note).
    // message/detail can carry model output (untrusted) — strip secrets/PII BEFORE the write and
    // mark the record accordingly, per the journal schema's redaction contract (plan §13.9).
    const db = getDb();
    const type = JOURNAL_TYPE_BY_KIND[kind];
    if (db !== null && type !== undefined) {
      const safeMessage = Logger.redact(message);
      const safeDetail = detail !== undefined ? Logger.redact(detail) : undefined;
      try {
        appendChainedEvent(db, {
          id: randomUUID(),
          type,
          ts: Date.now(),
          actor: 'agent',
          correlationId: runId,
          payload:
            safeDetail !== undefined
              ? { kind, message: safeMessage, detail: safeDetail }
              : { kind, message: safeMessage },
          redacted: true,
        });
      } catch (err) {
        Logger.warn('Journal append failed', { err: String(err) });
      }
    }
    // Human Handoff Controller: surface the handoff across every channel — the user may be looking
    // elsewhere while the agent runs. NotificationHost records it in the center, shows a toast, and
    // raises a native OS notification (all localized, gated on the notifications preference).
    if (kind === 'handoff') {
      NotificationHost.push({
        source: 'agent',
        kind: 'warning',
        title: mainStrings().agent.handoff.notifyTitle,
        body: message,
        channels: ['center', 'toast', 'native'],
      });
    }
  };
  const onCheckpoint: NonNullable<Parameters<typeof AgentService.run>[1]['onCheckpoint']> = (
    checkpoint,
  ) => {
    const db = getDb();
    if (db === null) return;
    let payload: unknown = checkpoint;
    try {
      payload = JSON.parse(Logger.redact(JSON.stringify(checkpoint)));
    } catch {
      payload = checkpoint;
    }
    try {
      appendChainedEvent(db, {
        id: randomUUID(),
        type: 'CheckpointWritten',
        ts: Date.now(),
        actor: 'agent',
        correlationId: runId,
        payload,
        redacted: true,
      });
    } catch (err) {
      Logger.warn('Journal checkpoint append failed', { err: String(err) });
    }
  };
  return { onEvent, onModelDelta, onCheckpoint };
}
