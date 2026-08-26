import type { PolicyDecision, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import { isSensitiveSite } from './sensitive-site';
import type { PolicyReason } from './policy-reasons';
import { applyTrust, profileFor, type TrustRule } from './trust-profile';

/**
 * Deterministic Policy Kernel (L8). Runs in plain code BEFORE the LLM — security is enforced here,
 * never delegated to model guardrails (a prompt-injected model must not be able to widen its own
 * permissions). Given a tool call's danger class + taint + target site, it returns allow / deny /
 * ask, plus a machine-readable reason (Permission Debug) and whether HIGH-RISK biometric (Windows
 * Hello) confirmation is required.
 */
export interface PolicyContext {
  /** The tool being invoked (its declared danger class drives the base decision). */
  descriptor: Pick<ToolDescriptor, 'id' | 'dangerClass'>;
  /** True if ANY argument is derived from untrusted web content (taint/provenance). */
  taintedArgs: boolean;
  /** URL the action targets, for the sensitive-site lockout. Omit when not site-scoped. */
  targetUrl?: string;
  /**
   * True when the TAB this call targets currently has its egress killed — a dropped VPN/Tor tunnel, a
   * DNS-leak/cleartext-when-tunnel-expected anomaly, or any other case `BindingService.mayEgress`
   * (Phase 5) reports as `false`. The network layer already fails the request closed; this is what
   * keeps the agent from retrying, escalating, or otherwise treating a silently-blocked connection as
   * an ordinary failure to route around. Omit when the caller has no tab context (nothing to check).
   */
  egressBlocked?: boolean;
  /**
   * The code-execution class of this call, when it runs model-authored code (S5).
   *
   * Deliberately NOT a new {@link RiskLevel}. A danger class describes what a tool DOES; this
   * describes where its instructions came from, which is an independent axis — a read written by a
   * model out of page content is a different thing from a read a tool author wrote, even though
   * both only read.
   */
  capability?: 'code_exec_read' | 'code_exec_write';
}

export interface PolicyResult {
  decision: PolicyDecision;
  /**
   * Stable reason code (Permission Debug: "why am I being asked / blocked?").
   *
   * A closed union, not a string: every code must be listed in `policy-reasons.ts`, and a completeness
   * test requires en+tr text for each. Adding a rule without explaining it to the person it stops is
   * now a build failure rather than a thing to notice later.
   */
  reason: PolicyReason;
  /** HIGH-RISK actions require biometric (Windows Hello) confirmation at the HITL step. */
  biometric: boolean;
}

const HIGH_RISK: ReadonlySet<RiskLevel> = new Set<RiskLevel>(['destructive', 'financial']);
const SIDE_EFFECT: ReadonlySet<RiskLevel> = new Set<RiskLevel>([
  'state_changing',
  'destructive',
  'financial',
]);

export default class PolicyKernel {
  /**
   * The user's standing per-site postures. Injected rather than read from a store so the kernel stays
   * pure and Electron-free; the desktop app loads them from preferences and re-registers on change.
   *
   * Wired here, at the one PEP every tool call already passes through, rather than left as a decision
   * layer with no caller — a trust setting nothing consults is worse than no setting, because the user
   * believes it took effect.
   */
  private static trustProfiles: readonly TrustRule[] = [];

  static setTrustProfiles(profiles: readonly TrustRule[]): void {
    PolicyKernel.trustProfiles = profiles;
  }

  static evaluate(ctx: PolicyContext): PolicyResult {
    return PolicyKernel.withTrust(PolicyKernel.baseEvaluate(ctx), ctx);
  }

  /**
   * Apply the site's trust profile to the kernel's verdict.
   *
   * Runs LAST, on a decision that already exists, which is what makes "can only tighten" checkable:
   * there is always a baseline to compare against, and `applyTrust` refuses to move a `deny` or to
   * auto-approve destructive/financial/tainted calls. The reason code is left untouched when nothing
   * changed, so Permission Debug keeps naming the rule that actually decided.
   */
  private static withTrust(policy: PolicyResult, ctx: PolicyContext): PolicyResult {
    const level = profileFor(ctx.targetUrl, PolicyKernel.trustProfiles);
    if (level === 'default') return policy;
    const adjusted = applyTrust(policy, level, {
      risk: ctx.descriptor.dangerClass,
      taintedArgs: ctx.taintedArgs,
    });
    if (adjusted.decision === policy.decision) return policy;
    return {
      ...policy,
      decision: adjusted.decision,
      reason:
        adjusted.changedBy === 'restricted' ? 'trust_profile_restricted' : 'trust_profile_trusted',
    };
  }

  private static baseEvaluate(ctx: PolicyContext): PolicyResult {
    const risk = ctx.descriptor.dangerClass;
    const highRisk = HIGH_RISK.has(risk);

    // 0) Code execution, decided before anything else so no later branch can soften it.
    //
    // `code_exec_write` is reserved and DENIED in v1 — present as a class precisely so that enabling
    // it is a visible change to this function with its own ADR and its own adversarial battery,
    // rather than a flag someone flips. `code_exec_read` is allowed and JOURNALLED: the caller
    // records the script HASH at this decision point (never the body — a model-authored script is
    // composed from page content, and copying it into the audit log would preserve the payload in
    // the one record meant to be trustworthy).
    if (ctx.capability === 'code_exec_write') {
      return { decision: 'deny', reason: 'code_exec_write_disabled', biometric: false };
    }

    // 1) Egress-blocked tab (Phase 5 kill-switch / DNS-leak anomaly): the most fundamental gate, ahead
    // of site sensitivity, because the question here is not "which site" but "can this even reach the
    // network at all". Same read/else split as the sensitive-site lockout below, for the same reason —
    // a read still tells the agent SOMETHING (why nothing loaded) and is worth a confirm rather than a
    // flat refusal, but anything that changes state on a connection already failing closed is refused.
    if (ctx.egressBlocked === true) {
      if (risk === 'read') {
        return { decision: 'ask', reason: 'tab_egress_blocked_read', biometric: false };
      }
      return { decision: 'deny', reason: 'tab_egress_blocked', biometric: false };
    }

    // 2) Sensitive-site lockout (bank/crypto/password/health): locked from automation by default.
    if (ctx.targetUrl !== undefined && isSensitiveSite(ctx.targetUrl)) {
      if (risk === 'read') {
        return { decision: 'ask', reason: 'sensitive_site_read', biometric: false };
      }
      return { decision: 'deny', reason: 'sensitive_site_lockout', biometric: false };
    }

    // 3) Tainted (web-derived) args on a side-effecting call → always HITL (injection containment).
    if (ctx.taintedArgs && SIDE_EFFECT.has(risk)) {
      return { decision: 'ask', reason: 'tainted_side_effect', biometric: highRisk };
    }

    // 4) Base decision by danger class.
    switch (risk) {
      case 'read':
        return ctx.capability === 'code_exec_read'
          ? { decision: 'allow', reason: 'code_exec_read_journaled', biometric: false }
          : { decision: 'allow', reason: 'read_allowed', biometric: false };
      case 'state_changing':
        return { decision: 'ask', reason: 'state_change_confirm', biometric: false };
      case 'destructive':
        return { decision: 'ask', reason: 'destructive_confirm', biometric: true };
      case 'financial':
        return { decision: 'ask', reason: 'financial_confirm', biometric: true };
      default:
        // Unknown/unhandled class → fail safe to HITL.
        return { decision: 'ask', reason: 'unknown_risk_confirm', biometric: false };
    }
  }
}
