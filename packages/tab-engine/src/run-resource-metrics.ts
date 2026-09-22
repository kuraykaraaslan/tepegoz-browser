/**
 * Per-agent-run resource accounting (S7 PR6 "Resource accounting per run") — peak resident memory and
 * CPU-seconds attributed to ONE run's lifetime, so "the agent made my browser slow" becomes a number
 * next to the token-cost chip instead of an argument.
 *
 * Pure and Electron-free, mirroring {@link ./task-metrics.ts}'s split: the host (main process) samples
 * `app.getAppMetrics()` and `process.resourceUsage()` and calls these functions; this file owns only the
 * arithmetic, so it is unit-tested without a running app.
 *
 * **Two different techniques for two different questions**, chosen deliberately rather than sampling
 * both the same way:
 *
 * - **CPU-seconds** is a single before/after diff of `process.resourceUsage()` on the MAIN process.
 *   That call is cumulative since process start (not "since the last call", which is what
 *   `app.getAppMetrics().cpu.percentCPUUsage` reports), so two snapshots bracketing the run give an
 *   exact answer with no sampling error and no polling at all.
 * - **Peak RSS** genuinely needs periodic sampling — memory is a level, not a delta, and a run's peak
 *   can sit anywhere in the middle of its lifetime. `app.getAppMetrics()` is the only source for a
 *   renderer's memory (Node's `process.resourceUsage()` only sees the calling process), so the host
 *   samples it on step transitions (never on an interval — see the host module's own doc for how that
 *   keeps idle cost at zero) and this module folds each sample into a running high-water mark.
 */

/** One `app.getAppMetrics()` entry, narrowed to what the fold needs. */
export interface RunResourceProcessMetric {
  pid: number;
  /** Working-set size in KIB, as Electron reports it. */
  workingSetKb: number;
}

/**
 * One sample: the full metrics snapshot, plus which pids are attributed to the run AT THAT MOMENT.
 *
 * `pids` is supplied fresh per sample rather than fixed once, so a run whose working tab changes
 * (navigation opens a new tab, the reactor follows it) is attributed to whichever renderer was actually
 * driving the run when that sample was taken — the old tab's pid simply stops contributing to later
 * samples, the same way `browser-host.electron.ts`'s `resolveRunTab` re-latches onto a new tab.
 */
export interface RunResourceSample {
  pids: readonly number[];
  metrics: readonly RunResourceProcessMetric[];
}

export interface RunResourceAccumulator {
  /** High-water mark, across every sample folded in, of the SUM of the attributed pids' working sets
   *  at that sample. 0 before the first sample (a run with zero samples reports zero, not unknown —
   *  see the host module for why zero samples can legitimately happen on a very short run). */
  peakRssBytes: number;
  sampleCount: number;
}

export function emptyRunResourceAccumulator(): RunResourceAccumulator {
  return { peakRssBytes: 0, sampleCount: 0 };
}

const BYTES_PER_KIB = 1024;

/**
 * Fold one sample into the accumulator.
 *
 * A pid the sample asked for but that is no longer in `metrics` (the process exited between the last
 * sample and this one, or a pid never resolved) contributes 0 to THIS sample rather than throwing or
 * carrying forward a stale value — an accumulator must never invent a number it did not measure.
 */
export function foldRunResourceSample(
  acc: RunResourceAccumulator,
  sample: RunResourceSample,
): RunResourceAccumulator {
  const byPid = new Map(sample.metrics.map((m) => [m.pid, m.workingSetKb]));
  let sumBytes = 0;
  for (const pid of sample.pids) {
    const kb = byPid.get(pid);
    if (kb !== undefined) sumBytes += kb * BYTES_PER_KIB;
  }
  return {
    peakRssBytes: Math.max(acc.peakRssBytes, sumBytes),
    sampleCount: acc.sampleCount + 1,
  };
}

/** The two `process.resourceUsage()` fields this module cares about, in MICROSECONDS (Node's unit). */
export interface CpuTimeMicros {
  userCPUTime: number;
  systemCPUTime: number;
}

/**
 * CPU-seconds spent between two `process.resourceUsage()` snapshots. Clamped to 0 rather than allowed
 * to go negative — `resourceUsage()` is monotonic in practice, but a clamp costs nothing and a negative
 * "CPU-seconds" would be a more confusing failure than an understated zero.
 */
export function cpuSecondsDelta(before: CpuTimeMicros, after: CpuTimeMicros): number {
  const deltaMicros =
    after.userCPUTime - before.userCPUTime + (after.systemCPUTime - before.systemCPUTime);
  return Math.max(0, deltaMicros) / 1_000_000;
}
