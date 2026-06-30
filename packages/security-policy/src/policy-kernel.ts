import type { PolicyDecision, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import { isSensitiveSite } from './sensitive-site';

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
}

export interface PolicyResult {
  decision: PolicyDecision;
  /** Stable reason code (Permission Debug: "why am I being asked / blocked?"). */
  reason: string;
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
        return { decision: 'allow', reason: 'read_allowed', biometric: false };
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
