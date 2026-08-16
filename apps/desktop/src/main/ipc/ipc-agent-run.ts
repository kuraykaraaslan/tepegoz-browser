import { AppError, Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentEventKind,
  type AgentPlanPreview,
  type AgentRunResult,
} from '@tepegoz/desktop-ipc';
import { AgentRunInputSchema } from '@tepegoz/desktop-ipc/schemas';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { resolveAutonomy } from '@tepegoz/security-policy';
import { TokenLedger } from '@tepegoz/model-gateway';
import { EventJournal, TokenStore } from '@tepegoz/persistence';
import type { Plan } from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import AgentService, {
  type AgentRunSummary,
  type PlanApprovalDecision,
} from '../agent/agent-service.electron';
import { setCurrentAgentRun } from '../agent/browser-host.electron';
import {
  createRunControl,
  hasActiveAgentRun,
  unregisterRunControl,
} from '../agent/agent-run-lock.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { getDb } from '../db/database.electron';
import { mainStrings } from '../lib/i18n-main';
import NotificationHost from '../notifications/notification-host';
import PreferenceStore from '@tepegoz/preferences';
import { handleAsync } from './ipc-helpers';
import {
  agentRunByGroup,
  broadcastConversationsState,
  isHistoryKind,
  JOURNAL_TYPE_BY_KIND,
  maybeWarnQuota,
  pendingApprovals,
  pendingPlans,
  REFUNDABLE_STOP_REASONS,
  requireAgentEnabled,
  safeArgsPreview,
  tokenUsage,
} from './ipc-agent-shared';

// Agent run counter (registerAgentIpc runs once at startup, so module scope is fine). HITL ids are
// randomUUID-based, not sequential — a predictable approval id is guessable by a compromised renderer.
let runCounter = 0;

/** Register the agent run handler (streams live events + round-trips HITL approvals). */
export function registerAgentRunIpc(): void {
  // Agent (Do mode). agent:run streams live events back to the SENDER and round-trips HITL approvals;
  // the raw API key and tool args never cross to the renderer (only a truncated preview does).
  handleAsync(IpcChannels.agentRun, async (event, payload): Promise<AgentRunResult> => {
    requireAgentEnabled();
    const { prompt, groupId, displayPrompt, attachmentMeta } = AgentRunInputSchema.parse(payload);
    if (hasActiveAgentRun()) {
      throw new AppError('An agent task is already running', 409);
    }
    if (agentRunByGroup.get(groupId) === true) {
      throw new AppError('An agent task is already running for this group', 409);
    }
    agentRunByGroup.set(groupId, true);
    const sender = event.sender;
    const runId = `run-${String(++runCounter)}`;
    const historyDb = getDb();
    const history =
      historyDb === null
        ? null
        : AgentService.beginHistoryTurn(historyDb, {
            groupId,
            runId,
            prompt: displayPrompt ?? prompt,
            attachments: attachmentMeta ?? [],
            ts: Date.now(),
          });
    if (history !== null) broadcastConversationsState();
    const control = createRunControl(runId, () => {
      // Phase 2 (resilience): kick the NetworkMonitor into active reconnect probing when a drop is seen
      // only on the model socket. No-op for now — pause/steer (Phase 1) do not need it.
    });
    const sendEvent = (e: AgentEvent): void => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentEvent, e);
    };
    setCurrentAgentRun(runId, groupId, sendEvent);
    const onEvent = (kind: AgentEventKind, message: string, detail?: string): void => {
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
      // Project agent events into the Event Journal (append-only audit; DoD "→ Event Journal").
      // message/detail can carry model output (untrusted) — strip secrets/PII BEFORE the write and
      // mark the record accordingly, per the journal schema's redaction contract (plan §13.9).
      const db = getDb();
      const type = JOURNAL_TYPE_BY_KIND[kind];
      if (db !== null && type !== undefined) {
        const safeMessage = Logger.redact(message);
        const safeDetail = detail !== undefined ? Logger.redact(detail) : undefined;
        try {
          EventJournal.append(db, {
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
    const onCheckpoint: NonNullable<Parameters<typeof AgentService.run>[1]['onCheckpoint']> = (checkpoint) => {
      const db = getDb();
      if (db === null) return;
      let payload: unknown = checkpoint;
      try {
        payload = JSON.parse(Logger.redact(JSON.stringify(checkpoint)));
      } catch {
        payload = checkpoint;
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
        Logger.warn('Journal checkpoint append failed', { err: String(err) });
      }
    };
    /** Present the standard HITL approval modal and await the user's answer. */
    const promptApproval = (req: ConfirmRequest): Promise<boolean> => {
      // Unguessable id. A sequential counter let a compromised renderer spray approvals for ids main
      // had not minted yet and win the race the moment one was registered; a UUID cannot be predicted,
      // so only the request main actually sent can be answered.
      const approvalId = `appr-${randomUUID()}`;
      const request: AgentApprovalRequest = {
        runId,
        groupId,
        approvalId,
        toolName: req.toolName,
        reason: req.policy.reason,
        biometric: req.policy.biometric,
        argsPreview: safeArgsPreview(req.args),
      };
      onEvent('awaiting_approval', `Approval needed: ${req.toolName}`, req.policy.reason);
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentApprovalRequest, request);
      return new Promise<boolean>((resolve) => {
        pendingApprovals.set(approvalId, { runId, resolve });
        setTimeout(() => {
          if (pendingApprovals.delete(approvalId)) resolve(false); // fail-safe deny on no response
        }, 120_000);
      });
    };
    // File tools self-gate on their folder grant mode: an op within the granted mode runs silently,
    // one outside every grant is refused, and an escalation / grant-management tool falls through to the
    // standard approval modal so the user consents. Every other tool goes straight to the modal.
    //
    // The autonomy level is read HERE, in main, from the preference store — never from the renderer.
    // The renderer is untrusted: it may display an approval and relay a human's click, but it must not
    // decide one. If autonomy auto-approves, main resolves without ever sending the IPC, so there is no
    // request for a compromised renderer to answer on the user's behalf.
    const requestApproval = async (req: ConfirmRequest): Promise<boolean> => {
      const decision = await FileOperationsHost.consentDecision(req);
      if (decision.type === 'auto') return decision.approved;
      const gate = resolveAutonomy(req.policy, PreferenceStore.getAll().agentAutonomy);
      if (gate.decision === 'auto_approve') {
        Logger.info('Approval auto-granted by autonomy level', {
          runId,
          toolName: req.toolName,
          policyReason: req.policy.reason,
          autonomyReason: gate.reason,
        });
        return true;
      }
      return promptApproval(req);
    };
    const requestPlanApproval = (plan: Plan): Promise<PlanApprovalDecision> => {
      // Plan approval follows the same rule: any level above `ask` accepts the plan in main. The plan
      // itself is not a gated action — every step still passes the kernel + autonomy gate above.
      if (PreferenceStore.getAll().agentAutonomy !== 'ask') return Promise.resolve({ approved: true });
      const planId = `plan-${randomUUID()}`;
      const preview: AgentPlanPreview = {
        runId,
        groupId,
        planId,
        goal: plan.goal,
        steps: plan.steps.map((s) => ({ id: s.id, tool: s.tool, rationale: s.rationale })),
      };
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentPlanPreview, preview);
      return new Promise<PlanApprovalDecision>((resolve) => {
        pendingPlans.set(planId, { runId, resolve });
        setTimeout(() => {
          if (pendingPlans.delete(planId)) resolve({ approved: false }); // fail-safe reject
        }, 120_000);
      });
    };

    // Token budget (L7): the account quota + the persisted lifetime BEFORE this run. Used for the
    // pre-flight gate, the live indicator seed, the auto-refund, and the 80% warning crossing check.
    const budgetDb = getDb();
    const tokenQuota = PreferenceStore.getAll().agentTokenQuota;
    const lifetimeUsedBefore =
      budgetDb !== null ? TokenStore.lifetimeTotals(budgetDb).totalTokens : 0;
    let runSummary: AgentRunSummary | undefined;
    let runThrew = false;

    try {
      // Pre-flight budget gate: block BEFORE planning when the account quota is already spent.
      if (tokenQuota > 0 && lifetimeUsedBefore >= tokenQuota) {
        throw new AppError('Token quota reached. Increase it in Settings → Agent, or reset usage.', 429);
      }
      const summary = await AgentService.run(
        prompt,
        {
          onEvent,
          onCheckpoint,
          requestPlanApproval,
          requestApproval,
          signal: control.signal,
          control,
        },
        groupId,
        displayPrompt ?? prompt,
        { quota: tokenQuota, lifetimeUsed: lifetimeUsedBefore },
      );
      runSummary = summary;
      return { runId, stoppedReason: summary.stoppedReason, ok: summary.ok };
    } catch (err) {
      runThrew = true;
      onEvent('error', err instanceof Error ? err.message : 'Agent run failed');
      throw err;
    } finally {
      // Persist THIS run's usage to the SQLite Token Ledger (provider+model+capability), then auto-refund
      // when the run failed for a reason outside the user's control, and raise the 80% warning if this
      // run crossed the threshold. Best-effort: a ledger write must never break the run's teardown.
      const persistDb = getDb();
      if (persistDb !== null) {
        try {
          TokenStore.recordRun(persistDb, {
            correlationId: runId,
            ts: Date.now(),
            entries: TokenLedger.snapshotEntries(),
          });
          const refundable =
            runThrew || (runSummary !== undefined && REFUNDABLE_STOP_REASONS.has(runSummary.stoppedReason));
          if (refundable) TokenStore.refundRun(persistDb, runId, Date.now());
          maybeWarnQuota(tokenQuota, lifetimeUsedBefore, TokenStore.lifetimeTotals(persistDb).totalTokens);
        } catch (err) {
          Logger.warn('Token ledger persist failed', { err: String(err) });
        }
      }
      setCurrentAgentRun(null, null, null);
      unregisterRunControl(runId);
      agentRunByGroup.delete(groupId);
      if (!sender.isDestroyed()) sender.send(IpcChannels.tokenUsage, tokenUsage());
    }
  });
}
