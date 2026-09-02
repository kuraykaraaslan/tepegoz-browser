import type { RiskLevel } from '@tepegoz/shared-types';

/**
 * The restricted unattended trust profile (Phase 6, AutomationScheduler; ADR-0013 in the phase doc).
 *
 * Stated in the phase's own words, which this module exists to make true by construction rather than by
 * convention: *"scheduled runs execute a sealed one-way narrowing of the user's Policy IR — ONLY read +
 * pre-approved idempotent state-changes whitelisted at authoring time may run unattended."* Two
 * properties, both enforced here rather than left to a caller to remember:
 *
 * 1. **Never wider than what interactive authoring actually approved.** A scheduled run cannot invoke a
 *    tool the recipe never touched while a human was watching — that would be the schedule quietly
 *    growing the recipe's own authority after the fact, which is exactly the "sealed" half of "sealed
 *    one-way narrowing".
 * 2. **`destructive` and `financial` are never auto-run, full stop.** No pre-approval flag, no prior
 *    interactive use, nothing overrides this. Real money and irreversible actions face a human every
 *    time, unattended or not — the same invariant the ai-agent autonomy gate holds for `financial`
 *    under the interactive `auto` setting, applied here to the harder case of no human present at all.
 *
 * `destructive`/`financial` steps in a scheduled recipe do not fail the run outright: per the phase's
 * DoD, they PAUSE — journal a `HitlRequested`, push a notification, and resume on the next approval,
 * never auto-approving. That pause/resume mechanism needs a live scheduler and is not implemented here;
 * this module only answers the yes/no the scheduler acts on.
 */

export interface UnattendedStepQuery {
  toolId: string;
  dangerClass: RiskLevel;
  /** Set ONLY at authoring time, by the human who recorded/distilled the recipe — never inferred, never
   *  set by the scheduler itself. This is the one way a `state_changing` step can ever auto-run. */
  preApprovedIdempotent?: boolean;
}

export type UnattendedVerdict =
  | { autoRun: true }
  | {
      autoRun: false;
      reason: 'never_unattended_tier' | 'not_in_interactive_profile' | 'requires_hitl';
    };

export interface InteractiveProfile {
  /** Tool ids this recipe actually invoked during its OWN interactive authoring run (distillation or
   *  recording) — the ceiling. Not "every tool the user has ever approved anywhere": a tool this specific
   *  recipe never used interactively has no standing to run unattended under it. */
  approvedToolIds: ReadonlySet<string>;
}

const NEVER_UNATTENDED: ReadonlySet<RiskLevel> = new Set(['destructive', 'financial']);

/**
 * May this one step run without pausing for a human, under a scheduled/unattended run?
 *
 * Checked in the order that makes each refusal reason mean exactly one thing: the tier ceiling first
 * (nothing overrides it), then the sealed-narrowing ceiling (a tool outside the authored recipe cannot
 * appear), then the ordinary read-vs-state-changing rule.
 */
export function mayRunUnattended(
  query: UnattendedStepQuery,
  interactive: InteractiveProfile,
): UnattendedVerdict {
  if (NEVER_UNATTENDED.has(query.dangerClass)) {
    return { autoRun: false, reason: 'never_unattended_tier' };
  }
  if (!interactive.approvedToolIds.has(query.toolId)) {
    return { autoRun: false, reason: 'not_in_interactive_profile' };
  }
  if (query.dangerClass === 'read') return { autoRun: true };
  // state_changing: the ONLY tier that can be auto-run, and only when explicitly pre-approved.
  return query.preApprovedIdempotent === true
    ? { autoRun: true }
    : { autoRun: false, reason: 'requires_hitl' };
}

export interface UnattendedProfile {
  /** Tool ids this recipe may invoke unattended, computed once from the interactive ceiling + each
   *  step's own declared idempotent-pre-approval. */
  autoRunToolIds: ReadonlySet<string>;
}

/**
 * Compile the unattended profile for a whole recipe. The name is deliberately "narrow", not "compute" or
 * "build" — the output can only ever be a subset of `interactive.approvedToolIds`, and the property is
 * checked directly by the test suite rather than merely implied by reading the implementation.
 */
export function narrowToUnattended(
  steps: readonly UnattendedStepQuery[],
  interactive: InteractiveProfile,
): UnattendedProfile {
  const autoRun = new Set<string>();
  for (const step of steps) {
    if (mayRunUnattended(step, interactive).autoRun) autoRun.add(step.toolId);
  }
  return { autoRunToolIds: autoRun };
}
