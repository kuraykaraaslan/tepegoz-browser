import {
  NEVER_AUTO_GRANTABLE_TIERS,
  type AgentAutonomy,
  type RiskTier,
} from '@tepegoz/shared-types';
import type { PolicyResult } from './policy-kernel';

/**
 * The autonomy gate (L8). Given a policy result the {@link PolicyKernel} has already produced, decide
 * whether the configured autonomy level lets the run skip the human prompt.
 *
 * **This is a trust-boundary decision and belongs in the main process.** It used to be taken in the
 * renderer, which auto-answered the approval IPC from a renderer-held autonomy value — meaning a
 * doctored or compromised renderer could approve financial, credential and destructive calls on its
 * own. The renderer is untrusted; it may *display* an approval and relay a human's click, but it may
 * never *decide* one.
 *
 * Two invariants this function exists to keep:
 *
 * 1. **Autonomy can only skip a prompt, never overturn a denial.** A `deny` never reaches here — the
 *    gateway fails closed before confirmation — and `allow` never needed a prompt in the first place.
 * 2. **Biometric survives every level except explicit `auto`.** Whatever the kernel marked as needing
 *    Windows-Hello-grade confirmation stays in front of a human under `act`.
 * 3. **`financial` survives EVERY level, `auto` included.** No grant may cover that tier anywhere else
 *    in the system, so a single autonomy setting must not be the one door around it. `auto` still means
 *    "do the routine work without asking" — it never meant "spend my money without asking", and reading
 *    one as the other grants a permission nobody made.
 *
 * Unknown values fail safe to `prompt`: this is called with a value read from a preference store, so
 * a stale or tampered level must degrade to *more* friction, never less.
 */

export type AutonomyGateDecision = 'auto_approve' | 'prompt';

export interface AutonomyGateResult {
  decision: AutonomyGateDecision;
  /** Stable reason code, mirroring {@link PolicyResult.reason} for Permission Debug + audit. */
  reason: string;
}

export function resolveAutonomy(
  policy: Pick<PolicyResult, 'decision' | 'biometric'>,
  autonomy: AgentAutonomy,
  tier?: RiskTier,
): AutonomyGateResult {
  // Defence in depth: the gateway only calls the confirm handler for `ask`, but if a caller ever
  // routes a decided result through here, autonomy must not be able to change it.
  if (policy.decision === 'deny')
    return { decision: 'prompt', reason: 'autonomy_cannot_override_deny' };
  if (policy.decision === 'allow') return { decision: 'auto_approve', reason: 'policy_allowed' };

  switch (autonomy) {
    case 'auto':
      // Money stops for a human at EVERY level, including this one (S8 owner decision, commerce).
      // `auto` used to approve a payment unconditionally, which made it the single path in the
      // codebase around a tier nothing else may cover: plan grants cannot, remembered grants cannot,
      // `act` holds it, and the kernel marks it biometric. "Do the routine work without asking" is
      // what a user chooses `auto` for; "spend my money without asking" is a different choice, and
      // reading one as the other grants a permission nobody made.
      //
      // Deliberately narrowed to `financial`. S6-PR2 decided `auto` should mean what the user chose
      // and encoded that in a test; S8 overrides it for commerce specifically, which is the case the
      // owner ruled on. `credential` and `destructive` are still auto-approved under `auto` — see the
      // note in phase-s8-assistant-ux.md, which asks for that decision rather than assuming it.
      if (tier === 'financial') {
        return { decision: 'prompt', reason: 'autonomy_auto_financial_held' };
      }
      return { decision: 'auto_approve', reason: 'autonomy_auto' };
    case 'act':
      // High-risk (destructive / financial / tainted side-effect) still stops for a human.
      if (policy.biometric) return { decision: 'prompt', reason: 'autonomy_act_biometric_held' };
      // The derived tier catches what `biometric` cannot. `biometric` follows the tool's DECLARED
      // dangerClass, so filling a password field — declared merely `state_changing` — used to sail
      // straight through `act`. Classified on its arguments it is `credential`, and `act` holds it.
      if (tier !== undefined && NEVER_AUTO_GRANTABLE_TIERS.includes(tier)) {
        return { decision: 'prompt', reason: `autonomy_act_${tier}_held` };
      }
      return { decision: 'auto_approve', reason: 'autonomy_act' };
    case 'ask':
      return { decision: 'prompt', reason: 'autonomy_ask' };
    default:
      // `dangerous` and anything unrecognised — fail safe, never escalate.
      return { decision: 'prompt', reason: 'autonomy_unknown_held' };
  }
}
