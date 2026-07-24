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

export interface RepeatSummary {
  repeat: number;
  perScenario: RepeatScenarioStat[];
  /** Pooled per-trial aggregates — the constitution's claim-bearing family shape (never a single
   *  scenario's 1/3→2/3 flip). */
  pooled: { dev: PooledStat; heldOut: PooledStat };
}

function pool(rows: ScenarioFrequency[], repeat: number): PooledStat {
  const k = rows.reduce((sum, r) => sum + r.passes, 0);
  const n = rows.length * repeat;
  return { k, n, rate: n === 0 ? 0 : k / n, ci: wilsonInterval(k, n) };
}

/**
 * Fold the per-scenario pass frequencies of one sweep into the report's repeat block: per-scenario
 * k/N + Wilson CI + flaky tag (confirmed against a prior sweep when one is supplied), plus pooled
 * dev/held-out per-trial aggregates.
 */
export function summarizeRepeat(
  freq: ScenarioFrequency[],
  repeat: number,
  priorPasses?: ReadonlyMap<string, { passes: number; n: number }>,
): RepeatSummary {
  return {
    repeat,
    perScenario: freq.map((f) => {
      const flaky = isFlaky(f.passes, repeat);
      const prior = priorPasses?.get(f.id);
      return {
        id: f.id,
        heldOut: f.heldOut,
        passes: f.passes,
        n: repeat,
        ci: wilsonInterval(f.passes, repeat),
        flaky,
        ...(prior !== undefined ? { flakyConfirmed: flaky && isFlaky(prior.passes, prior.n) } : {}),
      };
    }),
    pooled: {
      dev: pool(freq.filter((f) => !f.heldOut), repeat),
      heldOut: pool(freq.filter((f) => f.heldOut), repeat),
    },
  };
}
