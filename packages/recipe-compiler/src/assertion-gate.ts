import type { AssertionTier } from '@tepegoz/shared-types';
import type { AssertionVerdict } from './assertion-evaluator';

/**
 * Whether a failed assertion halts the run.
 *
 * **Defaults to `hard`** when a step carries an assertion but no explicit tier — an author (or the
 * distiller) who bothered to attach a post-condition almost certainly meant it as a real check; treating
 * an unmarked assertion as decorative would silently downgrade the safety property the phase is built
 * around ("verified-done, not vibe-done") the moment someone forgot one field.
 *
 * This is the full extent of what is implemented from the phase's "bounded ladder" (re-stabilize →
 * re-perceive/re-bind → one scoped model replan → HITL with the exact failing predicate). Only the
 * first and last rungs exist here: a hard failure halts immediately with the predicate that failed,
 * exactly as the phase's HITL rung needs it. The re-stabilize / re-bind / scoped-replan rungs need a
 * live page and a model seam neither of which this package touches — they are owed, not implemented,
 * and this function does not pretend otherwise by retrying anything itself.
 */
export function shouldHaltOnFailure(tier: AssertionTier | undefined, verdict: AssertionVerdict): boolean {
  if (verdict.passed) return false;
  return (tier ?? 'hard') === 'hard';
}
