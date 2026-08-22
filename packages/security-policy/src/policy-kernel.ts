import type { PolicyDecision, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import { isSensitiveSite } from './sensitive-site';
import type { PolicyReason } from './policy-reasons';

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
  static evaluate(ctx: PolicyContext): PolicyResult {
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

    // 1) Sensitive-site lockout (bank/crypto/password/health): locked from automation by default.
    if (ctx.targetUrl !== undefined && isSensitiveSite(ctx.targetUrl)) {
      if (risk === 'read') {
        return { decision: 'ask', reason: 'sensitive_site_read', biometric: false };
      }
      return { decision: 'deny', reason: 'sensitive_site_lockout', biometric: false };
    }

    // 2) Tainted (web-derived) args on a side-effecting call → always HITL (injection containment).
    if (ctx.taintedArgs && SIDE_EFFECT.has(risk)) {
      return { decision: 'ask', reason: 'tainted_side_effect', biometric: highRisk };
    }

    // 3) Base decision by danger class.
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
