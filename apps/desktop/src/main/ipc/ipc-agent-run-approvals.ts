import { Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentEventKind,
  type AgentPlanPreview,
} from '@tepegoz/desktop-ipc';
import type { AuditEntry, ConfirmRequest } from '@tepegoz/capability-plane';
import {
  classifyRisk,
  PlanGrantStore,
  REMEMBERED_GRANT_DAYS,
  resolveAutonomy,
} from '@tepegoz/security-policy';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { NEVER_AUTO_GRANTABLE_TIERS, type Plan } from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type { PlanApprovalDecision } from '../agent/agent-service.electron';
import { browserHost } from '../agent/browser-host.electron';
import TabManager from '../tabs';
import { planGrantScope } from '../agent/plan-grant-scope';
import {
  mayOfferRemember,
  rememberGrant,
  rememberedCoverage,
  type resolveSkillScope,
} from '../agent/remembered-grant-scope';
import FileOperationsHost from '../file-operations/file-operations-host';
import { getDb } from '../db/database.electron';
import { appendChainedEvent } from '../notary/chained-journal';
import { mainStrings } from '../lib/i18n-main';
import NotificationHost from '../notifications/notification-host';
import PreferenceStore from '@tepegoz/preferences';
import { pendingApprovals, pendingPlans, safeArgsPreview } from './ipc-agent-shared';

/**
 * Human-in-the-loop gates for `agent:run` (see `ipc-agent-run.ts`): the approval modal round-trip, the
 * standing-permission coverage checks (plan grant, remembered grant, autonomy level), the plan-approval
 * preview and the Permission Debug journal. Every decision is made HERE, in main — the renderer only
 * displays a request and relays a human's click, and an auto-approving level never sends the IPC at all.
 */

/** The site a one-tap scope grant would cover, for the prompt to name. Null when unparseable — the
 *  offer is then withheld rather than described vaguely. */
function scopeHostField(url: string): { scopeHost?: string } {
  try {
    return { scopeHost: new URL(url).host };
  } catch {
    return {};
  }
}

/** Deduped hostnames for the plan-preview "sites touched" line — an unparseable entry (a step's
 *  arguments matched something URL-shaped that `new URL` still rejects) is dropped rather than shown
 *  as garbage. */
function hostnamesOf(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const u of urls) {
    try {
      hosts.add(new URL(u).host);
    } catch {
      // not a real URL — skip
    }
  }
  return [...hosts];
}

/** Fill the `{skill}` placeholder. A placeholder, not concatenation: Turkish puts the name first. */
function fillSkill(template: string, skill: string): string {
  return template.replace('{skill}', skill);
}

/** The tab group the user is actually looking at, or null when the active tab is in none. */
function watchedGroupId(): string | null {
  const state = TabManager.getState();
  return state.tabs.find((t) => t.id === state.activeId)?.groupId ?? null;
}

/**
 * Raise an OS/centre notification when an approval belongs to a group the user is NOT looking at.
 *
 * The Agent panel renders one group at a time, so a request raised for another group lands in that
 * group's state and is simply never drawn. With one run per process that could not happen — the run
 * was always the one you started. Now that runs are per tab group and concurrent, an unwatched
 * request would sit invisible until the 120s fail-safe rejected it, and the user would see a task
 * "fail" for no reason they could observe. Silent for the group being watched: the modal is already
 * on screen there, and a duplicate notification for it would be noise that trains the user to ignore
 * the channel.
 */
function notifyIfUnwatched(groupId: string, toolName: string, reason: string): void {
  if (watchedGroupId() === groupId) return;
  NotificationHost.push({
    source: 'agent',
    kind: 'warning',
    title: mainStrings().agent.notifications.approvalNeededTitle,
    body: `${toolName}: ${reason}`,
    channels: ['center', 'toast', 'native'],
  });
}

export interface RunApprovalsContext {
  runId: string;
  groupId: string;
  sender: WebContents;
  historyDb: ReturnType<typeof getDb>;
  /** The scope a remembered grant may be matched against — null for an ad-hoc task. */
  skillScope: ReturnType<typeof resolveSkillScope>;
  onEvent: (kind: AgentEventKind, message: string, detail?: string) => void;
}

export interface RunApprovals {
  requestApproval: (req: ConfirmRequest) => Promise<boolean>;
  requestPlanApproval: (plan: Plan) => Promise<PlanApprovalDecision>;
  onAudit: (entry: AuditEntry) => void;
}

export function createRunApprovals(ctx: RunApprovalsContext): RunApprovals {
  const { runId, groupId, sender, historyDb, skillScope, onEvent } = ctx;
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
      // A tool-supplied plain-language description of the exact call (target + effect), shown in
      // place of the raw args preview when the tool provides one.
      ...(req.summary !== undefined ? { summary: req.summary } : {}),
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
    notifyIfUnwatched(groupId, req.toolName, req.policy.reason);
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
  // Permission Debug (S8 PR7): which standing permission last answered an `ask` WITHOUT a live
  // prompt, for `onAudit` below to attach to that same decision's journal record. Set by the three
  // coverage branches in `requestApproval`, consumed and cleared the moment `onAudit` writes the
  // record — never left standing, so it cannot attach to a LATER, unrelated call.
  let lastGrantHint: 'plan_grant' | 'remembered_grant' | 'autonomy' | null = null;
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
        lastGrantHint = 'plan_grant';
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
        lastGrantHint = 'remembered_grant';
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
      lastGrantHint = 'autonomy';
      return true;
    }
    return promptApproval(req);
  };
  /**
   * Permission Debug (S8 PR7): journal this run's Policy Kernel verdicts for the per-site, per-tool
   * decision history a user can look up later — read-only, and it changes nothing about what the
   * kernel decided or who it asked. Two shapes are written: the kernel's own `allow`/`deny` (a
   * single audit call, nothing to resolve) and an `ask` that finished resolving (`outcome` present).
   * The PRE-resolution `ask` call is skipped — `awaiting_approval` already journals "we asked" — so
   * only the complete record is written, which is what lets it also carry `lastGrantHint`.
   */
  const onAudit = (entry: AuditEntry): void => {
    if (entry.decision === 'ask' && entry.outcome === undefined) return;
    const db = getDb();
    if (db === null) return;
    const rememberedBy = lastGrantHint;
    lastGrantHint = null; // consumed — must never attach to the NEXT unrelated call
    try {
      appendChainedEvent(db, {
        id: randomUUID(),
        type:
          entry.decision === 'deny' || entry.outcome === 'refused'
            ? 'PolicyBlocked'
            : 'ToolInvoked',
        ts: Date.now(),
        actor: 'agent',
        correlationId: runId,
        payload: {
          toolName: Logger.redact(entry.toolName),
          ...(entry.targetUrl !== undefined ? { targetUrl: Logger.redact(entry.targetUrl) } : {}),
          reason: entry.reason,
          ...(entry.riskTier !== undefined ? { riskTier: entry.riskTier } : {}),
          decision: entry.decision,
          ...(entry.outcome !== undefined ? { outcome: entry.outcome } : {}),
          ...(rememberedBy !== null ? { rememberedBy } : {}),
        },
        redacted: true,
      });
    } catch (err) {
      Logger.warn('Permission Debug journal append failed', { err: String(err) });
    }
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
    // Same "entry tab + every URL found in a step's arguments" heuristic planGrantScope uses to size
    // the approval grant, reused here rather than reinvented — the preview and the grant it leads to
    // should never be able to disagree about what the plan touches.
    const entryUrl = browserHost.listTabs().find((t) => t.active)?.url ?? null;
    const scope = planGrantScope(
      plan,
      entryUrl,
      (toolId) => CapabilityRegistry.get(toolId)?.descriptor.dangerClass,
    );
    // dangerClass is the tool's own DECLARED class (registration-time, static) — not the finer
    // RiskTier a HITL prompt shows later, which depends on this step's actual arguments and is not
    // known yet. Absent when the tool id does not resolve (a plan naming a tool this build has never
    // registered), so the preview never crashes on an unrecognized step — and such a step cannot
    // contribute to guaranteedApprovals either, the same "unknown tool contributes nothing" rule
    // planGrantScope applies.
    let guaranteedApprovals = 0;
    const steps = plan.steps.map((s) => {
      const dangerClass = CapabilityRegistry.get(s.tool)?.descriptor.dangerClass;
      if (dangerClass !== undefined) {
        const tier = classifyRisk({ descriptor: { id: s.tool, dangerClass }, args: s.args }).tier;
        if (NEVER_AUTO_GRANTABLE_TIERS.includes(tier)) guaranteedApprovals += 1;
      }
      return {
        id: s.id,
        tool: s.tool,
        rationale: s.rationale,
        ...(dangerClass !== undefined ? { dangerClass } : {}),
      };
    });
    const preview: AgentPlanPreview = {
      runId,
      groupId,
      planId,
      goal: plan.goal,
      steps,
      sites: hostnamesOf(scope.urls),
      guaranteedApprovals,
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
  return { requestApproval, requestPlanApproval, onAudit };
}
