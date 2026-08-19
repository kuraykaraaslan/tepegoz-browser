/**
 * Adaptive validation cadence (S7 PR2).
 *
 * The reactor used to run a full planner validation pass every third action, on a modulo — regardless of
 * whether anything had happened worth judging. On a run of reads over a page that never changed, that is a
 * whole model round-trip spent to re-answer a question whose inputs are identical.
 *
 * The replacement is a signal comparison, not a model call: validate when the perceived world has moved
 * since the last validation, and otherwise only when a ceiling forces it.
 *
 * **The cadence can only ever validate LESS often than the old modulo, never more.** That is the point of
 * the floor. A page whose signature churns every step — a live ticker, an animation, a rotating banner —
 * would otherwise trigger validation on *every* action and make this change a cost regression on exactly
 * the pages that look busiest. With the floor pinned to the old interval, the worst case is today's
 * behaviour and the best case is the ceiling. No sweep is needed to know the sign of the change.
 *
 * Completion CLAIMS are not routed through here at all: the planner remains the sole terminator and is
 * asked every time the actor claims to be done (`settleClaim`). This governs the *periodic* pass only.
 */

export interface ValidationCadenceState {
  /** Actions taken since the last validation pass. */
  actionsSinceValidation: number;
  /** The world signature as of the last validation, or null if nothing has been validated yet. */
  sigAtLastValidation: string | null;
  /** The world signature now. Null when nothing has been perceived yet. */
  currentSig: string | null;
}

export interface ValidationCadenceBounds {
  /** Never validate more often than this. Pinned to the old fixed interval — see the note above. */
  floor: number;
  /** Validate at least this often even if the signature never moves (a stuck page still gets judged). */
  ceiling: number;
}

export interface ValidationDecision {
  validate: boolean;
  /** Stable reason code, for the ledger and for tests that assert *why*, not just whether. */
  reason: 'below_floor' | 'page_changed' | 'ceiling' | 'page_unchanged';
}

/** Derive the bounds from the existing interval option — deliberately not a new budget to tune. */
export function cadenceBounds(planningInterval: number): ValidationCadenceBounds {
  const floor = Math.max(1, planningInterval);
  return { floor, ceiling: floor * 2 };
}

export function shouldValidate(
  state: ValidationCadenceState,
  bounds: ValidationCadenceBounds,
): ValidationDecision {
  if (state.actionsSinceValidation < bounds.floor) return { validate: false, reason: 'below_floor' };
  // A signature we have never validated against counts as changed: the first pass must happen.
  if (state.currentSig !== null && state.currentSig !== state.sigAtLastValidation) {
    return { validate: true, reason: 'page_changed' };
  }
  if (state.actionsSinceValidation >= bounds.ceiling) return { validate: true, reason: 'ceiling' };
  return { validate: false, reason: 'page_unchanged' };
}
