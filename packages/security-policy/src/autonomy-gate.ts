import type { AgentAutonomy } from '@tepegoz/shared-types';
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
): AutonomyGateResult {
  // Defence in depth: the gateway only calls the confirm handler for `ask`, but if a caller ever
  // routes a decided result through here, autonomy must not be able to change it.
  if (policy.decision === 'deny') return { decision: 'prompt', reason: 'autonomy_cannot_override_deny' };
  if (policy.decision === 'allow') return { decision: 'auto_approve', reason: 'policy_allowed' };

  switch (autonomy) {
    case 'auto':
      return { decision: 'auto_approve', reason: 'autonomy_auto' };
    case 'act':
      // High-risk (destructive / financial / tainted side-effect) still stops for a human.
      return policy.biometric
        ? { decision: 'prompt', reason: 'autonomy_act_biometric_held' }
        : { decision: 'auto_approve', reason: 'autonomy_act' };
    case 'ask':
      return { decision: 'prompt', reason: 'autonomy_ask' };
    default:
      // `dangerous` and anything unrecognised — fail safe, never escalate.
      return { decision: 'prompt', reason: 'autonomy_unknown_held' };
  }
}
