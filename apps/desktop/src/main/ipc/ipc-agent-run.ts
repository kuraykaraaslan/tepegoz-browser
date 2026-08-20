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
import { PlanGrantStore, REMEMBERED_GRANT_DAYS, resolveAutonomy } from '@tepegoz/security-policy';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { TokenLedger } from '@tepegoz/model-gateway';
import { EventJournal, TokenStore } from '@tepegoz/persistence';
import {
  AgentDeltaSchema,
  MAX_DELTA_TEXT,
  CompletionOutcomeSchema,
  NEVER_AUTO_GRANTABLE_TIERS,
  type CompletionOutcome,
  type Plan,
} from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import AgentService, {
  type AgentRunSummary,
  type PlanApprovalDecision,
} from '../agent/agent-service.electron';
import {
  browserHost,
  releaseAgentRun,
  setCurrentAgentRun,
  withAgentRunScope,
} from '../agent/browser-host.electron';
import { planGrantScope } from '../agent/plan-grant-scope';
import {
  mayOfferRemember,
  rememberGrant,
  rememberedCoverage,
  resolveSkillScope,
} from '../agent/remembered-grant-scope';
import { createRunControl, unregisterRunControl } from '../agent/agent-run-lock.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { getDb } from '../db/database.electron';
import { mainStrings } from '../lib/i18n-main';
import { setTrayAgentRunning } from '../tray';
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

/** The site a one-tap scope grant would cover, for the prompt to name. Null when unparseable — the
 *  offer is then withheld rather than described vaguely. */
function scopeHostField(url: string): { scopeHost?: string } {
  try {
    return { scopeHost: new URL(url).host };
  } catch {
    return {};
  }
}

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

/** Fill the `{skill}` placeholder. A placeholder, not concatenation: Turkish puts the name first. */
function fillSkill(template: string, skill: string): string {
  return template.replace('{skill}', skill);
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
    const { prompt, groupId, displayPrompt, attachmentMeta, skillId } =
      AgentRunInputSchema.parse(payload);
    // ONE run per tab group, not one per process. The process-wide gate is gone because the state that
    // made it necessary is: each run now holds its own working tab (so two runs cannot fight over one
    // page), its own CDP attachment, its own input adapter, its own token ledger, and its own event
    // channel. What remains genuinely shared is a *preference* (the model override, which is meant to
    // apply everywhere) and the user-control yield (where stopping every run is the point).
    if (agentRunByGroup.get(groupId) === true) {
      throw new AppError('An agent task is already running for this group', 409);
    }
    agentRunByGroup.set(groupId, true);
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
      agentRunByGroup.delete(groupId);
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
    const sendEvent = (e: AgentEvent): void => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentEvent, e);
    };
    setCurrentAgentRun(runId, groupId, sendEvent);
    /**
     * Streamed model fragments (ADR-0025). Deliberately its own channel, not `agentEvent`: a delta is
     * UNSETTLED model output, so unlike every event above it is never journaled, never written to
     * conversation history, and never replayed. It exists only so the panel can show that work is
     * happening before the step settles.
     */
    // The FIRST fragment carries how long the user waited for it — the time-to-first-feedback
    // measurement (S8). Only the first: paying for the metric on every token would be measuring
    // something that by definition happens once.
    const runStartedAt = Date.now();
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
      // Null when the call was never risk-classified. A default tier here would let a doctored
      // renderer tick "remember" on an unclassified action and mint a grant the user was never
      // offered — the classification is what the grant is scoped BY, so its absence must refuse.
      const facts =
        req.risk === undefined
          ? null
          : { tier: req.risk.tier, targetUrl: req.targetUrl, policyReason: req.policy.reason };
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
        // Display only — main already decided. Lets the modal name the act instead of showing a flat
        // "a tool wants to change state", which is what trains a user to click through.
        ...(req.risk !== undefined ? { riskTier: req.risk.tier } : {}),
        // S9: offer "remember this" only when a grant would actually be honoured. A checkbox the
        // system would refuse teaches the user that their choices are decorative.
        ...(mayOfferRemember(skillScope, facts) && skillScope !== null
          ? { rememberSkill: skillScope.name, rememberDays: REMEMBERED_GRANT_DAYS }
          : {}),
        // The run-scoped one-tap grant is offered whenever there is something to scope it TO, and
        // never for a tier a grant may not cover — the prompt must not offer what main would refuse.
        ...(facts !== null &&
        req.targetUrl !== undefined &&
        !NEVER_AUTO_GRANTABLE_TIERS.includes(facts.tier)
          ? scopeHostField(req.targetUrl)
          : {}),
      };
      onEvent('awaiting_approval', `Approval needed: ${req.toolName}`, req.policy.reason);
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentApprovalRequest, request);
      return new Promise<boolean>((resolve) => {
        pendingApprovals.set(approvalId, {
          runId,
          resolve: (outcome) => {
            // The tick is relayed by the renderer; rememberGrant re-checks whether it MAY be
            // remembered, so a doctored renderer cannot store a grant the rules would refuse.
            // S8: "allow this on this site for the rest of the task". The same act as approving a
            // plan, taken one step at a time — and it cannot cover money, secrets or deletion,
            // because grantFromApproval strips those tiers exactly as minting does.
            if (
              outcome.approved &&
              outcome.grantScope &&
              facts !== null &&
              req.targetUrl !== undefined
            ) {
              const grant = PlanGrantStore.grantFromApproval(runId, req.targetUrl, facts.tier);
              Logger.info('User widened the run scope from an approval', {
                runId,
                domains: grant.domains,
                tiers: grant.tiers,
              });
            }
            if (outcome.approved && outcome.remember) {
              const expiresAt = rememberGrant(historyDb, skillScope, facts);
              if (expiresAt !== null && skillScope !== null) {
                onEvent(
                  'grant',
                  fillSkill(mainStrings().agent.grants.remembered, skillScope.name),
                  'remembered_grant',
                );
              }
            }
            resolve(outcome.approved);
          },
        });
        setTimeout(() => {
          // fail-safe deny on no response
          if (pendingApprovals.delete(approvalId)) resolve(false);
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
      // A plan the user approved already covers its own routine steps on its own sites. Checked before
      // the autonomy level because it is the NARROWER authority — scoped to domains and classes the
      // user actually saw — and it can never cover financial/credential/destructive.
      const tier = req.risk?.tier;
      if (tier !== undefined) {
        const grant = PlanGrantStore.covers({ runId, targetUrl: req.targetUrl, tier });
        if (grant.covered) {
          Logger.info('Approval covered by the approved plan grant', {
            runId,
            toolName: req.toolName,
            riskTier: tier,
          });
          return true;
        }
      }
      // A grant the user saved for THIS skill on THIS site. Checked after the plan grant (which is
      // narrower still: one run) and before the autonomy level (which is broader: every run). It can
      // never cover credential/financial/destructive, nor a taint prompt — see coversRemembered.
      if (tier !== undefined) {
        const remembered = rememberedCoverage(historyDb, skillScope, {
          tier,
          targetUrl: req.targetUrl,
          policyReason: req.policy.reason,
        });
        if (remembered.covered && skillScope !== null) {
          Logger.info('Approval covered by a remembered grant', {
            runId,
            skill: skillScope.name,
            toolName: req.toolName,
            riskTier: tier,
          });
          // Visible in the transcript, not only in the log: a persistent grant that acts invisibly is
          // one the user cannot know to revoke.
          onEvent(
            'grant',
            fillSkill(mainStrings().agent.grants.used, skillScope.name),
            'remembered_grant',
          );
          return true;
        }
      }
      const gate = resolveAutonomy(
        req.policy,
        PreferenceStore.getAll().agentAutonomy,
        req.risk?.tier,
      );
      if (gate.decision === 'auto_approve') {
        Logger.info('Approval auto-granted by autonomy level', {
          runId,
          toolName: req.toolName,
          policyReason: req.policy.reason,
          autonomyReason: gate.reason,
          riskTier: req.risk?.tier ?? 'unclassified',
        });
        return true;
      }
      return promptApproval(req);
    };
    /**
     * Approving a plan is a single informed consent covering the ROUTINE steps that plan implies — so
     * the prompts that remain are the ones that actually deserve a human. The grant is scoped to the
     * plan's own sites and classes (never a run-wide default), excludes financial/credential/destructive
     * by construction, and is revoked in this run's `finally`.
     */
    const mintPlanGrant = (plan: Plan): void => {
      // Synchronous, so approval is not delayed: the active tab's committed URL is already in tab state.
      const entryUrl = browserHost.listTabs().find((t) => t.active)?.url ?? null;
      const scope = planGrantScope(
        plan,
        entryUrl,
        (toolId) => CapabilityRegistry.get(toolId)?.descriptor.dangerClass,
      );
      const grant = PlanGrantStore.mint(runId, scope.urls, scope.tiers);
      Logger.info('Plan approved — minted a scoped grant', {
        runId,
        domains: grant.domains,
        tiers: grant.tiers,
      });
    };
    const requestPlanApproval = (plan: Plan): Promise<PlanApprovalDecision> => {
      // Plan approval follows the same rule: any level above `ask` accepts the plan in main. The plan
      // itself is not a gated action — every step still passes the kernel + autonomy gate above.
      if (PreferenceStore.getAll().agentAutonomy !== 'ask') {
        mintPlanGrant(plan);
        return Promise.resolve({ approved: true });
      }
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
        // The grant is minted from the plan the user SAW and approved — never on rejection, and never
        // on the fail-safe timeout below.
        const settle = (decision: PlanApprovalDecision): void => {
          if (decision.approved) mintPlanGrant(plan);
          resolve(decision);
        };
        pendingPlans.set(planId, { runId, resolve: settle });
        setTimeout(() => {
          if (pendingPlans.delete(planId)) resolve({ approved: false }); // fail-safe reject
        }, 120_000);
      });
    };

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
          if (!sender.isDestroyed()) sender.send(IpcChannels.tokenUsage, tokenUsage());
        }
      }),
    );
  });
}
