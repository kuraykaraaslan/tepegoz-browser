/**
 * M1 (Baseline Zero) statistics: Wilson score intervals, flaky classification, and the pooled
 * repeat-summary the report carries beside the majority verdicts. Pure + dependency-free so every
 * number the harness prints is unit-testable.
 *
 * Why Wilson (not normal approximation): eval Ns are small (3–10 trials); the Wilson interval stays
 * inside [0,1] and behaves sanely at k=0 and k=n, which is exactly where an agent eval lives.
 */

export interface Interval {
  lo: number;
  hi: number;
}

/** Wilson 95% score interval for k successes in n trials. `{lo:0, hi:1}` for n=0 — total ignorance,
 *  never a fake certainty. */
export function wilsonInterval(k: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    lo: Math.max(0, (centre - spread) / denom),
    hi: Math.min(1, (centre + spread) / denom),
  };
}

/** Flaky = neither always-pass nor always-fail across this sweep's trials (0 < k < n). A flaky
 *  scenario is a real SIGNAL (report it) but not claim-bearing evidence (exclude from blocking gates). */
export function isFlaky(passes: number, n: number): boolean {
  return n > 1 && passes > 0 && passes < n;
}

export interface ScenarioFrequency {
  id: string;
  heldOut: boolean;
  passes: number;
  /** VALID trials this scenario contributed (transport-invalid trials are retried, then EXCLUDED — see
   *  `runScenarioTrials`). This is the honest denominator: a launch/navigation flake scored as a wrong
   *  answer is exactly how a flaky machine has quietly deflated every k/N the harness ever produced. May
   *  be 0 when every trial was transport-invalid even after retries (the scenario is UNMEASURED). */
  n: number;
}

export interface RepeatScenarioStat {
  id: string;
  heldOut: boolean;
  passes: number;
  n: number;
  ci: Interval;
  flaky: boolean;
  /** Present when a comparable prior sweep existed: flaky in BOTH sweeps (the M1 "0<k<N over two
   *  sweeps" tag that excludes a scenario from blocking gates). */
  flakyConfirmed?: boolean;
}

export interface PooledStat {
  /** Summed passes across every trial of every scenario in the tier. */
  k: number;
  /** Summed trials. */
  n: number;
  rate: number;
  ci: Interval;
}

/** Pool k successes over n trials into a rate + Wilson CI (the one place a PooledStat is minted). */
function poolCounts(k: number, n: number): PooledStat {
  return { k, n, rate: n === 0 ? 0 : k / n, ci: wilsonInterval(k, n) };
}

export interface RepeatSummary {
  repeat: number;
  perScenario: RepeatScenarioStat[];
  /** Pooled per-trial aggregates — the constitution's claim-bearing family shape (never a single
   *  scenario's 1/3→2/3 flip). */
  pooled: { dev: PooledStat; heldOut: PooledStat };
}

function pool(rows: ScenarioFrequency[]): PooledStat {
  return poolCounts(
    rows.reduce((sum, r) => sum + r.passes, 0),
    rows.reduce((sum, r) => sum + r.n, 0),
  );
}

/**
 * Fold the per-scenario pass frequencies of one sweep into the report's repeat block: per-scenario
 * k/N + Wilson CI + flaky tag (confirmed against a prior sweep when one is supplied), plus pooled
 * dev/held-out per-trial aggregates. `repeat` is the configured trials-per-scenario (the report's
 * headline label); the actual denominator is each scenario's VALID trial count `f.n` (≤ repeat) so a
 * transport flake never counts as a competence fail.
 */
export function summarizeRepeat(
  freq: ScenarioFrequency[],
  repeat: number,
  priorPasses?: ReadonlyMap<string, { passes: number; n: number }>,
): RepeatSummary {
  return {
    repeat,
    perScenario: freq.map((f) => {
      const flaky = isFlaky(f.passes, f.n);
      const prior = priorPasses?.get(f.id);
      return {
        id: f.id,
        heldOut: f.heldOut,
        passes: f.passes,
        n: f.n,
        ci: wilsonInterval(f.passes, f.n),
        flaky,
        ...(prior !== undefined ? { flakyConfirmed: flaky && isFlaky(prior.passes, prior.n) } : {}),
      };
    }),
    pooled: {
      dev: pool(freq.filter((f) => !f.heldOut)),
      heldOut: pool(freq.filter((f) => f.heldOut)),
    },
  };
}

/** One scenario's contribution to the family aggregates: its tags + this sweep's pass and escape counts. */
export interface FamilyRow {
  id: string;
  heldOut: boolean;
  tags: readonly string[];
  /** Passes across this scenario's VALID trials. */
  passes: number;
  /** VALID trials (transport-invalid excluded) — the honest pass denominator. */
  n: number;
  /** Escapes (off-page / web_search) across the eligible valid trials — only fixture "sites" are eligible. */
  escapes: number;
  /** Eligible VALID trials — the honest escape denominator (0 when the scenario is not escape-scorable). */
  escapeN: number;
  /** Whether this scenario's target is escape-scorable at all (fixture, not a realUrl open-web task). */
  escapeEligible: boolean;
}

/** A family = every scenario carrying one tag, pooled. The constitution defines claim gates on **pooled
 *  family aggregates** (never a single scenario's flip); this is that shape, per tag, with an escape-rate
 *  companion so the C1 escape family (e.g. the `ai-7` tag) reads off directly. */
export interface FamilyStat {
  tag: string;
  /** Distinct dev scenarios in the family (held-out is excluded — it is reported separately, never pooled
   *  into a dev signal). */
  scenarios: number;
  /** Pooled per-trial pass rate + Wilson CI. */
  pass: PooledStat;
  /** Pooled per-trial escape rate + Wilson CI over the eligible trials — absent when no scenario in the
   *  family is escape-scorable. */
  escape?: PooledStat;
}

/**
 * Pool each tag's DEV scenarios into a {@link FamilyStat}: pass-rate and (where eligible) escape-rate, each
 * with a Wilson CI over pooled per-trial counts. Families smaller than `minScenarios` are omitted — a
 * one-scenario "family" is just that scenario (already in the per-scenario table) and pooling it would fake
 * a family-level signal. Deterministic (tags sorted) so the report is stable in tests.
 */
export function summarizeFamilies(rows: FamilyRow[], minScenarios = 2): FamilyStat[] {
  const dev = rows.filter((r) => !r.heldOut);
  const tags = [...new Set(dev.flatMap((r) => [...r.tags]))].sort();
  const out: FamilyStat[] = [];
  for (const tag of tags) {
    const fam = dev.filter((r) => r.tags.includes(tag));
    if (fam.length < minScenarios) continue;
    // Pool over VALID trials (each scenario's own n / escapeN), never the configured repeat — a
    // transport-flaked trial must not enter the pass or escape denominator.
    const pass = poolCounts(fam.reduce((s, r) => s + r.passes, 0), fam.reduce((s, r) => s + r.n, 0));
    const eligible = fam.filter((r) => r.escapeEligible);
    const stat: FamilyStat = { tag, scenarios: fam.length, pass };
    if (eligible.length > 0) {
      stat.escape = poolCounts(
        eligible.reduce((s, r) => s + r.escapes, 0),
        eligible.reduce((s, r) => s + r.escapeN, 0),
      );
    }
    out.push(stat);
  }
  return out;
}
