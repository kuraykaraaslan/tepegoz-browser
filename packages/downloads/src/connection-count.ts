/**
 * How many connections the next segmented transfer to a given host should open.
 *
 * `planDownloadSegments` takes a `maxSegments` and splits a file into that many ranges. That number
 * should not be a fixed setting: a host on a fast, unmetered link rewards more connections, and a host
 * that rate-limits or resets parallel sockets punishes them — opening eight against it is a way to be
 * slower AND to look like a scraper. So the count is a function of what the LAST transfer to that host
 * actually did, bounded by a per-host ceiling the user can see and lower.
 *
 * Everything here is a pure function, like `planDownloadSegments` / `planDownloadResume` /
 * `planDownloadRetry` beside it — the policy is read in one place, not inferred from a running timer.
 * The desktop `DownloadService` supplies the measurement and persists the per-host memory; nothing in
 * this module knows about a socket or a clock.
 */

import { MAX_DOWNLOAD_SEGMENTS } from './download-segments';

/**
 * Where a host with no history starts. Deliberately below {@link MAX_DOWNLOAD_SEGMENTS}: a browser
 * opens a conservative number of connections and EARNS more by measuring that they helped, rather than
 * opening the maximum and hoping the host tolerates it.
 */
export const DEFAULT_START_CONNECTIONS = 4;

/**
 * The ceiling for a host the user has not tuned. Same value as the start today — a fresh host gets the
 * default and cannot climb past it until the user raises the bar for that host — but kept separate
 * because they answer different questions ("where do we begin" vs "how high may we ever go").
 */
export const DEFAULT_HOST_CONNECTION_CEILING = 4;

/** What the last transfer's throughput said about adding connections. */
export type ParallelismVerdict =
  /** Aggregate throughput grew meaningfully with the extra connections — push higher. */
  | 'scaled'
  /** More connections bought little or nothing — hold, or drift down; they are not free to the host. */
  | 'flat'
  /** Aggregate throughput FELL, or the host signalled overload (429/503, dropped sockets) — back off. */
  | 'penalized';

export interface ConnectionCountInput {
  /** Count used for the previous transfer to this host, or null if there was none. */
  previous: number | null;
  /** The verdict from that previous transfer. Omit on the first transfer to a host. */
  observed?: ParallelismVerdict | undefined;
  /**
   * The user-visible per-host ceiling. Falls back to {@link DEFAULT_HOST_CONNECTION_CEILING}. Always
   * re-clamped to `[1, MAX_DOWNLOAD_SEGMENTS]` — a stored override from an older build cannot lift the
   * hard cap.
   */
  hostCeiling?: number | undefined;
}

export interface ConnectionCountPlan {
  count: number;
  reason:
    | 'first-transfer'
    | 'scaled-up'
    | 'held-at-ceiling'
    | 'held-flat'
    | 'backed-off'
    | 'floor';
}

/** Clamp a candidate count into `[1, ceiling]` where `ceiling` is itself clamped to the hard cap. */
function clampToCeiling(count: number, hostCeiling: number | undefined): number {
  const ceiling = Math.max(
    1,
    Math.min(MAX_DOWNLOAD_SEGMENTS, Math.trunc(hostCeiling ?? DEFAULT_HOST_CONNECTION_CEILING)),
  );
  return Math.max(1, Math.min(ceiling, Math.trunc(count)));
}

/**
 * Decide the connection count for the next transfer to a host.
 *
 * The moves are small on purpose — one step at a time — so a single noisy measurement cannot swing the
 * count from 2 to 8 and back. A `penalized` verdict is the exception: it halves, because the cost of
 * staying too high is a host that starts refusing connections, and that is worth over-correcting for.
 */
export function planConnectionCount(input: ConnectionCountInput): ConnectionCountPlan {
  // No history: start at the default, never above the host's ceiling.
  if (input.previous === null || input.observed === undefined) {
    return {
      count: clampToCeiling(DEFAULT_START_CONNECTIONS, input.hostCeiling),
      reason: 'first-transfer',
    };
  }

  const previous = Math.max(1, Math.trunc(input.previous));

  if (input.observed === 'penalized') {
    const halved = Math.floor(previous / 2);
    if (halved < 1) return { count: 1, reason: 'floor' };
    return { count: clampToCeiling(halved, input.hostCeiling), reason: 'backed-off' };
  }

  if (input.observed === 'flat') {
    // More connections did not help. Drift down by one so we stop paying a cost the host notices for
    // throughput we are not getting — but never below a single stream.
    if (previous <= 1) return { count: 1, reason: 'floor' };
    return { count: clampToCeiling(previous - 1, input.hostCeiling), reason: 'held-flat' };
  }

  // 'scaled': the extra connections earned their keep. Step up by one, unless the ceiling is reached.
  const stepped = clampToCeiling(previous + 1, input.hostCeiling);
  if (stepped === previous) return { count: previous, reason: 'held-at-ceiling' };
  return { count: stepped, reason: 'scaled-up' };
}

/**
 * Turn two throughput measurements into a {@link ParallelismVerdict}.
 *
 * `aggregateMbps` is the WHOLE transfer's rate (all connections summed), not per-connection — the
 * question is whether the file arrived faster, not whether each socket was busy. A host that halves
 * each connection's speed when you double the count has given you nothing and cost itself twice the
 * sockets: that is `flat`, not `scaled`.
 */
export function classifyParallelism(input: {
  previousCount: number;
  previousAggregateMbps: number;
  newCount: number;
  newAggregateMbps: number;
  /** The host said it was overloaded (HTTP 429/503) or reset connections mid-transfer. */
  hostSignalledOverload?: boolean | undefined;
}): ParallelismVerdict {
  if (input.hostSignalledOverload === true) return 'penalized';
  const { previousAggregateMbps: before, newAggregateMbps: after } = input;
  if (before <= 0 || after <= 0) return 'flat';

  // Throughput actually dropped with more connections in flight — the host is throttling parallelism.
  if (input.newCount > input.previousCount && after < before * 0.9) return 'penalized';

  // How much of the ideal linear speed-up we captured. Doubling connections and getting 1.6x is a
  // real win (0.8 of ideal); getting 1.1x is noise (0.55 of ideal).
  const countRatio = input.newCount / input.previousCount;
  if (countRatio <= 1) {
    // We did not add connections; "scaled" would be meaningless. Treat a hold-or-better as flat.
    return after >= before * 0.9 ? 'flat' : 'penalized';
  }
  const capturedFraction = (after / before - 1) / (countRatio - 1);
  return capturedFraction >= 0.6 ? 'scaled' : 'flat';
}
