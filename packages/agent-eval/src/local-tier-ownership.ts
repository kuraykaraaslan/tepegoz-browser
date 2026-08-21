/**
 * Which capability tiers the on-device model is allowed to own (S12a).
 *
 * The plumbing for local inference already exists — a GGUF provider, GBNF-constrained decoding, a
 * catalogue that downloads and sha256-verifies weights, and a router branch that offloads simple
 * capabilities. What has never existed is **evidence**: no local model has ever driven a decision
 * through this harness, so nobody knows what it can do without losing quality.
 *
 * This module is the ledger of that evidence, and it starts empty. The rule it enforces is the one the
 * phase states and the one a cost-saving feature is most likely to erode: **a tier is handed to local
 * only after a measured ±5pp equivalence on a pooled family, never because it seemed fine.** As with
 * S7's speed targets, the guard is mechanical rather than a sentence someone can read past —
 * `ownsLocally` cannot return true without a measurement, and there is no default that means "probably
 * fine".
 */

/** The equivalence margin a tier must clear before local may own it. */
export const EQUIVALENCE_MARGIN_PP = 5;

/**
 * Minimum pooled trials behind an ownership decision. Below this a "match" is noise: three trials that
 * happen to agree say nothing about a tier that will then run unattended forever.
 */
export const MIN_OWNERSHIP_TRIALS = 10;

/** Capabilities local could plausibly own. `plan` is deliberately absent — it stays frontier. */
export const LOCAL_CANDIDATE_CAPABILITIES = [
  'classify',
  'summarize',
  'redact',
  'loop_detect',
  'extract',
  'exec',
] as const;
export type LocalCandidateCapability = (typeof LOCAL_CANDIDATE_CAPABILITIES)[number];

export interface EquivalenceEvidence {
  capability: LocalCandidateCapability;
  /** Pooled pass rate on the cloud arm, 0–1. */
  cloudRate: number;
  /** Pooled pass rate on the local arm, 0–1. */
  localRate: number;
  /** Pooled VALID trials per arm (the smaller of the two, if they differ). */
  trials: number;
}

export type OwnershipVerdict =
  | { owns: true; reason: 'equivalent'; deltaPp: number }
  | {
      owns: false;
      reason: 'unmeasured' | 'too_few_trials' | 'quality_loss';
      deltaPp: number | null;
    };

/**
 * May local own this capability?
 *
 * `evidence` absent ⇒ **no**, with `unmeasured` — the state this repo is actually in. There is
 * deliberately no "assume equivalent for cheap tiers" path: the cheap tiers are exactly where a silent
 * quality loss would go unnoticed longest, because nobody inspects a classify call.
 */
export function ownsLocally(evidence: EquivalenceEvidence | undefined): OwnershipVerdict {
  if (evidence === undefined) return { owns: false, reason: 'unmeasured', deltaPp: null };
  const deltaPp = (evidence.localRate - evidence.cloudRate) * 100;
  if (evidence.trials < MIN_OWNERSHIP_TRIALS) {
    return { owns: false, reason: 'too_few_trials', deltaPp };
  }
  // One-sided on purpose, unlike S7's speed guardrail: local scoring HIGHER than cloud is not a reason
  // to refuse it the tier. It is a reason to look at the exam, but it is not a quality loss.
  // The epsilon is not decoration: (0.75 - 0.80) * 100 is -5.000000000000004 in IEEE-754, so a delta
  // sitting EXACTLY on the margin would be refused by a bare comparison. A rule that rejects the case
  // it was written to accept is a bug, and it would only ever show up on the boundary.
  if (deltaPp + EQUIVALENCE_MARGIN_PP < -1e-9) {
    return { owns: false, reason: 'quality_loss', deltaPp };
  }
  return { owns: true, reason: 'equivalent', deltaPp };
}

/**
 * The shipped ownership table.
 *
 * **Empty, and that is the honest state.** Every entry added here must cite the sweep that produced it
 * in `eval-results.md`. An entry with no ledger row behind it is a claim, not a measurement.
 */
export const MEASURED_LOCAL_OWNERSHIP: Readonly<
  Partial<Record<LocalCandidateCapability, EquivalenceEvidence>>
> = {};

/** Does the SHIPPED configuration route this capability to the on-device model? */
export function shipsLocally(capability: string): boolean {
  const evidence = (MEASURED_LOCAL_OWNERSHIP as Record<string, EquivalenceEvidence | undefined>)[
    capability
  ];
  return ownsLocally(evidence).owns;
}

/** Ledger lines. Prints the empty table as "none measured", never as an implicit "none needed". */
export function ownershipLines(): string[] {
  const owned = LOCAL_CANDIDATE_CAPABILITIES.filter((c) => shipsLocally(c));
  return [
    owned.length === 0
      ? 'local tier ownership: none measured — every capability still routes to the cloud'
      : `local tier ownership: ${owned.join(', ')}`,
    `equivalence margin: ±${String(EQUIVALENCE_MARGIN_PP)}pp over ≥${String(MIN_OWNERSHIP_TRIALS)} pooled trials`,
  ];
}
