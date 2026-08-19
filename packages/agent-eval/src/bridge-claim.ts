import { wilsonInterval } from './statistics';
import type { Agreement } from './calibration';

/**
 * The publishable bridge claim (S11).
 *
 * Everything in this module exists to make a *number* refusable. The program's own rule is that an
 * offline scripted pass is a regression fence, not evidence — so a live-web figure is the only thing
 * that can carry a claim, and a live-web figure scored by an uncalibrated judge is exactly the
 * auto-judge headline the constitution's Never-list forbids.
 *
 * So the gate is mechanical rather than editorial: `bridgeClaim` returns a `publishable: false` verdict
 * with a stated reason whenever the preconditions are not met, and there is no argument that overrides
 * it. Nothing here can produce a headline on its own.
 */

/** Human labels required before ANY bridge number may be published. */
export const MIN_CALIBRATION_LABELS = 25;

/**
 * The honest first-run target: the Wilson lower bound, not the point estimate.
 *
 * Stated as a **deliverable, not a threshold to defend** — the phase publishes Version 1 win or lose.
 * Naming it here keeps it from being quietly revised upward after the fact.
 */
export const FIRST_RUN_LOWER_BOUND_TARGET = 0.6;

export interface BridgeTrial {
  scenarioId: string;
  turkishWeb: boolean;
  /** Did the run's evidence support the completion? S4's metric, not "did it finish". */
  verified: boolean;
  /** Excluded from every denominator: a transport failure is not a competence result. */
  transportInvalid?: boolean;
}

export interface StratumResult {
  n: number;
  verified: number;
  rate: number | null;
  loCI: number | null;
  hiCI: number | null;
}

export interface BridgeClaim {
  whole: StratumResult;
  turkishWeb: StratumResult;
  /** Trials dropped as transport-invalid, reported so the denominator is auditable. */
  excluded: number;
  /** Judge↔human agreement, printed beside every number it scored. */
  agreement: Agreement | null;
  publishable: boolean;
  /** Why not, when `publishable` is false. Empty when it is. */
  blockers: string[];
  /** Whether the honest first-run target was met. NOT a condition of publishing. */
  meetsFirstRunTarget: boolean;
}

function summarize(trials: readonly BridgeTrial[]): StratumResult {
  const n = trials.length;
  const verified = trials.filter((t) => t.verified).length;
  if (n === 0) return { n: 0, verified: 0, rate: null, loCI: null, hiCI: null };
  const ci = wilsonInterval(verified, n);
  return { n, verified, rate: verified / n, loCI: ci.lo, hiCI: ci.hi };
}

/**
 * Compute the claim, and refuse to call it publishable unless it has earned it.
 *
 * Three blockers, each of which has a specific failure it prevents:
 *
 * 1. **No trials** — an empty stratum reports `null`, never 0%. An unmeasured rate printed as zero
 *    reads as a catastrophic result rather than as an absence.
 * 2. **Fewer than 25 human labels** — a judge that has been checked against one label has not been
 *    checked. This is the Never-list's auto-judge-headline ban, enforced instead of remembered.
 * 3. **Agreement never computed** — a calibration file can exist and still overlap this run in zero
 *    scenarios, which is not calibration either.
 */
export function bridgeClaim(
  trials: readonly BridgeTrial[],
  agreement: Agreement | null,
  labelCount: number,
): BridgeClaim {
  const valid = trials.filter((t) => t.transportInvalid !== true);
  const whole = summarize(valid);
  const turkishWeb = summarize(valid.filter((t) => t.turkishWeb));

  const blockers: string[] = [];
  if (whole.n === 0) blockers.push('no valid trials — the stratum was not run');
  if (labelCount < MIN_CALIBRATION_LABELS) {
    blockers.push(
      `judge calibration below the bar: ${String(labelCount)}/${String(MIN_CALIBRATION_LABELS)} human labels`,
    );
  }
  if (agreement === null || agreement.n === 0) {
    blockers.push('judge↔human agreement was never computed for this run');
  }

  return {
    whole,
    turkishWeb,
    excluded: trials.length - valid.length,
    agreement,
    publishable: blockers.length === 0,
    blockers,
    meetsFirstRunTarget: whole.loCI !== null && whole.loCI >= FIRST_RUN_LOWER_BOUND_TARGET,
  };
}

/** Ledger lines. Prints "not measured" rather than a 0% that would read as a measured failure. */
export function bridgeLines(claim: BridgeClaim): string[] {
  const pct = (n: number | null): string => (n === null ? 'not measured' : `${(n * 100).toFixed(1)}%`);
  const stratum = (label: string, r: StratumResult): string =>
    `${label}: ${pct(r.rate)} (${String(r.verified)}/${String(r.n)}` +
    `${r.loCI === null ? '' : `, 95% CI ${pct(r.loCI)}–${pct(r.hiCI)}`})`;
  return [
    stratum('bridge verified-completion', claim.whole),
    stratum('  └ Turkish-web sub-stratum', claim.turkishWeb),
    `judge↔human agreement: ${
      claim.agreement === null || claim.agreement.n === 0
        ? 'not computed'
        : `${(claim.agreement.rate * 100).toFixed(1)}% over ${String(claim.agreement.n)} labels`
    }`,
    `transport-invalid trials excluded: ${String(claim.excluded)}`,
    claim.publishable
      ? `PUBLISHABLE — first-run target (CI lower bound ≥${String(FIRST_RUN_LOWER_BOUND_TARGET * 100)}%): ${
          claim.meetsFirstRunTarget ? 'met' : 'not met (published anyway — the number is the deliverable)'
        }`
      : `NOT PUBLISHABLE — ${claim.blockers.join('; ')}`,
  ];
}
