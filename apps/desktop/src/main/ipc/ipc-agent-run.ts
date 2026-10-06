import { AppError, Logger } from '@tepegoz/libs';
import { IpcChannels, type AgentRunResult } from '@tepegoz/desktop-ipc';
import { AgentRunInputSchema } from '@tepegoz/desktop-ipc/schemas';
import { PlanGrantStore } from '@tepegoz/security-policy';
import { TokenLedger } from '@tepegoz/model-gateway';
import { TokenStore } from '@tepegoz/persistence';
import {
  CompletionEvidenceSchema,
  CompletionOutcomeSchema,
  type CompletionEvidence,
  type CompletionOutcome,
} from '@tepegoz/shared-types';
import AgentService, { type AgentRunSummary } from '../agent/agent-service.electron';
import {
  releaseAgentRun,
  setCurrentAgentRun,
  withAgentRunScope,
} from '../agent/browser-host.electron';
import {
  finishRunResourceTracking,
  startRunResourceTracking,
} from '../agent/run-resource-tracker.electron';
import { resolveSkillScope } from '../agent/remembered-grant-scope';
import { createRunControl, unregisterRunControl } from '../agent/agent-run-lock.electron';
import { getDb } from '../db/database.electron';
import { setTrayAgentRunning } from '../tray';
import PreferenceStore from '@tepegoz/preferences';
import { handle, handleAsync, parsePayload } from './ipc-helpers';
import {
  activeAgentGroups,
  agentRunByGroup,
  broadcastConversationsState,
  maybeWarnQuota,
  REFUNDABLE_STOP_REASONS,
  requireAgentEnabled,
  setAgentRunForGroup,
  tokenUsage,
} from './ipc-agent-shared';
import { createRunEvents, createSendEvent } from './ipc-agent-run-events';
import { createRunApprovals } from './ipc-agent-run-approvals';

/**
 * The completion outcome, validated before it leaves main.
 *
 * The runtime carries it as a plain string, and this is a trust boundary like any other: a value that
 * is not one of the three known outcomes is dropped rather than forwarded, because the renderer would
 * otherwise render an unknown state as if it meant something.
 */
function completionOutcomeField(raw: string | undefined): {
  completionOutcome?: CompletionOutcome;
} {
  const parsed = CompletionOutcomeSchema.safeParse(raw);
  return parsed.success ? { completionOutcome: parsed.data } : {};
}

/**
 * The evidence a completion outcome was judged against, validated the same way (S8 PR2). The runtime
 * carries it as a plain, decoupled shape (see `AgentRunSummary.evidence`'s own comment); this is where
 * it is checked back against the real schema before it leaves main, same trust-boundary discipline as
 * {@link completionOutcomeField}.
 */
function evidenceField(raw: unknown): { evidence?: CompletionEvidence } {
  const parsed = CompletionEvidenceSchema.safeParse(raw);
  return parsed.success ? { evidence: parsed.data } : {};
}

// Agent run counter (registerAgentIpc runs once at startup, so module scope is fine). HITL ids are
// randomUUID-based, not sequential — a predictable approval id is guessable by a compromised renderer.
let runCounter = 0;

/** Register the agent run handler (streams live events + round-trips HITL approvals). */
export function registerAgentRunIpc(): void {
  // Agent (Do mode). agent:run streams live events back to the SENDER and round-trips HITL approvals;
  // the raw API key and tool args never cross to the renderer (only a truncated preview does).
  handleAsync(IpcChannels.agentRun, async (event, payload): Promise<AgentRunResult> => {
    requireAgentEnabled();
    // safeParse, via parsePayload — never a bare `.parse()`. A ZodError is not an AppError, so the
    // boundary mapped a malformed RENDERER payload to a 500 "Internal error" and logged it as a
    // main-process fault: the user saw an internal failure, and the log named neither the field nor
    // the reason. A bad payload is the renderer's 400.
    const { prompt, groupId, displayPrompt, attachmentMeta, skillId } = parsePayload(
      AgentRunInputSchema,
      payload,
    );
    // ONE run per tab group, not one per process. The process-wide gate is gone because the state that
    // made it necessary is: each run now holds its own working tab (so two runs cannot fight over one
    // page), its own CDP attachment, its own input adapter, its own token ledger, and its own event
    // channel. What remains genuinely shared is a *preference* (the model override, which is meant to
    // apply everywhere) and the user-control yield (where stopping every run is the point).
    if (agentRunByGroup.get(groupId) === true) {
      throw new AppError(
        'An agent task is already running for this group',
        409,
        'agentRunInProgress',
      );
    }
    setAgentRunForGroup(groupId, true);
    // S8: the run is visible outside the panel from the moment it starts — see the finally block, which
    // clears it on every exit path including a crash.
    setTrayAgentRunning(true);
    const sender = event.sender;
    const runId = `run-${String(++runCounter)}`;
    /**
     * Release everything this handler has CLAIMED: the run lock, the per-group lock, this run's event
     * channel, the plan grant, and the tray indicator. Releases only THIS run's channel — a shared
     * "current run" pointer would let one run's teardown mute another's.
     */
    const releaseClaims = (): void => {
      releaseAgentRun(runId);
      unregisterRunControl(runId);
      setTrayAgentRunning(false);
      PlanGrantStore.revoke(runId);
      setAgentRunForGroup(groupId, false);
    };
    /**
     * Run one synchronous setup step, releasing every claim if it throws.
     *
     * The claims above are taken before the run’s own `try`/`finally` exists, and the setup between
     * them is not merely bookkeeping — it opens a history turn, reads the skill store, reads the
     * preference store and queries the token ledger. Any of those can throw. Without this, one
     * sqlite error left the single-run lock held forever: `hasActiveAgentRun()` stayed true and the
     * agent was dead for the whole session, with no error path that could ever clear it.
     */
    const setup = <T>(fn: () => T): T => {
      try {
        return fn();
      } catch (err) {
        releaseClaims();
        throw err;
      }
    };
    const historyDb = getDb();
    const history = setup(() =>
      historyDb === null
        ? null
        : AgentService.beginHistoryTurn(historyDb, {
            groupId,
            runId,
            prompt: displayPrompt ?? prompt,
            attachments: attachmentMeta ?? [],
            ts: Date.now(),
          }),
    );
    if (history !== null)
      setup(() => {
        broadcastConversationsState();
      });
    // S9: the scope a remembered grant may be matched against. Null for an ad-hoc task, and null
    // whenever the prompt no longer matches the named skill's stored one — see resolveSkillScope.
    const skillScope = setup(() => resolveSkillScope(historyDb, skillId, prompt));
    const control = setup(() =>
      createRunControl(runId, () => {
        // Phase 2 (resilience): kick the NetworkMonitor into active reconnect probing when a drop is seen
        // only on the model socket. No-op for now — pause/steer (Phase 1) do not need it.
      }),
    );
    const sendEvent = createSendEvent(sender);
    setCurrentAgentRun(runId, groupId, sendEvent);
    // The FIRST streamed fragment carries how long the user waited for it (S8) — see `createRunEvents`.
    const runStartedAt = Date.now();
    // S7 PR6 "Resource accounting per run": started here (run start) and closed out in the `finally`
    // below (run end) — never on an interval, so an idle app never samples. See the tracker module's
    // own doc for the idle-cost-zero argument.
    const resourceState = startRunResourceTracking();
    const { onEvent, onModelDelta, onCheckpoint } = createRunEvents({
      runId,
      groupId,
      sender,
      sendEvent,
      historyDb,
      history,
      resourceState,
      runStartedAt,
    });
    const { requestApproval, requestPlanApproval, onAudit } = createRunApprovals({
      runId,
      groupId,
      sender,
      historyDb,
      skillScope,
      onEvent,
    });

    // Token budget (L7): the account quota + the persisted lifetime BEFORE this run. Used for the
    // pre-flight gate, the live indicator seed, the auto-refund, and the 80% warning crossing check.
    const budgetDb = getDb();
    const tokenQuota = setup(() => PreferenceStore.getAll().agentTokenQuota);
    const lifetimeUsedBefore = setup(() =>
      budgetDb !== null ? TokenStore.lifetimeTotals(budgetDb).totalTokens : 0,
    );
    let runSummary: AgentRunSummary | undefined;
    let runThrew = false;

    // Two per-run scopes around the whole run, INCLUDING its `finally`:
    //  - the run's own token accumulator (the finally reads its entries back to persist them), and
    //  - the run's identity, so out-of-band narration from deep inside the call stack (the input
    //    adapter, tab ownership) reaches THIS run's panel and not whichever run started most recently.
    return withAgentRunScope(runId, () =>
      TokenLedger.runScoped(async () => {
        try {
          // Pre-flight budget gate: block BEFORE planning when the account quota is already spent.
          if (tokenQuota > 0 && lifetimeUsedBefore >= tokenQuota) {
            throw new AppError(
              'Token quota reached. Increase it in Settings → Agent, or reset usage.',
              429,
            );
          }
          const summary = await AgentService.run(
            prompt,
            {
              onEvent,
              onModelDelta,
              onCheckpoint,
              onAudit,
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
          return {
            runId,
            stoppedReason: summary.stoppedReason,
            ok: summary.ok,
            // S8: the panel shows what the evidence supported, not only that the run finished. Omitted
            // rather than defaulted when there was no verdict — "unknown" and "unverified" are different
            // claims and must not collapse into one chip.
            ...completionOutcomeField(summary.completionOutcome),
            // S8 PR2: WHICH record supported that verdict, so the chip can cite it.
            ...evidenceField(summary.evidence),
          };
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
                runThrew ||
                (runSummary !== undefined && REFUNDABLE_STOP_REASONS.has(runSummary.stoppedReason));
              if (refundable) TokenStore.refundRun(persistDb, runId, Date.now());
              maybeWarnQuota(
                tokenQuota,
                lifetimeUsedBefore,
                TokenStore.lifetimeTotals(persistDb).totalTokens,
              );
            } catch (err) {
              Logger.warn('Token ledger persist failed', { err: String(err) });
            }
          }
          // The same release path the setup guard uses, so the two can never drift apart. Everything in
          // it is idempotent: the tray indicator is cleared rather than toggled, the plan grant is deleted
          // by key, and the locks are map deletes. A crash or a cancel cannot leave any of them claimed —
          // which is also why grants never need to be persisted.
          releaseClaims();
          // Close out resource tracking with the run — the peak/CPU numbers ride the SAME push as the
          // token snapshot so the panel renders them together, never a second event. Best-effort like
          // the ledger persist above: a failed read must never break the run's teardown.
          let resourceUsage: { peakRssBytes: number; cpuSeconds: number } | undefined;
          try {
            resourceUsage = finishRunResourceTracking(resourceState);
          } catch (err) {
            Logger.warn('Run resource finish failed', { err: String(err) });
          }
          if (!sender.isDestroyed()) sender.send(IpcChannels.tokenUsage, tokenUsage(resourceUsage));
        }
      }),
    );
  });

  // S8 PR7: the snapshot a just-mounted window pulls once; live changes arrive via the
  // `agentActiveGroups` push in `setAgentRunForGroup`/`broadcastAgentActiveGroups`.
  handle(IpcChannels.agentActiveGroupsGet, (): string[] => activeAgentGroups());
}
