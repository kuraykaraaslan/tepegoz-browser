/** One progress observation for the sliding-window rate estimate. */
export interface DownloadRateSample {
  /** `Date.now()` when the byte count was read. */
  at: number;
  receivedBytes: number;
}

/** The derived transfer rate + ETA for a set of samples. */
export interface DownloadRate {
  bytesPerSecond: number;
  /** `null` when there is no total to estimate against, or the rate is zero. */
  etaSeconds: number | null;
}

/**
 * Transfer rate + ETA from a sliding window of progress samples. Pure so it is unit-tested directly
 * (the desktop service just keeps the window trimmed and feeds it in). Returns `null` until there are
 * two usable samples — a single point has no rate, and a browser that guessed one would only ever be
 * wrong.
 */
export function computeDownloadRate(
  samples: readonly DownloadRateSample[],
  totalBytes: number | null,
): DownloadRate | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || first === last) return null;
  const spanMs = last.at - first.at;
  const spanBytes = last.receivedBytes - first.receivedBytes;
  // A non-positive span (clock skew, a paused/rewound transfer) is not a rate we can trust.
  if (spanMs <= 0 || spanBytes < 0) return null;
  const bytesPerSecond = (spanBytes * 1000) / spanMs;
  const remaining = totalBytes !== null ? Math.max(0, totalBytes - last.receivedBytes) : null;
  const etaSeconds = remaining !== null && bytesPerSecond > 0 ? remaining / bytesPerSecond : null;
  return { bytesPerSecond, etaSeconds };
}
