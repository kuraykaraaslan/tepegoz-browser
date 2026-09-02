/**
 * Splitting one transfer into several ranged requests.
 *
 * The parallel-download idea is IDM's, and it is worth having — but a browser is not a scraper, and
 * the difference shows up entirely in the defaults. Eight connections against a small file is a way to
 * be slower AND ruder than one: the handshakes cost more than the bytes save, and a host that
 * penalises parallel connections has been given four extra reasons to.
 *
 * So segmentation is refused more often than it is used, and every refusal below is a case where one
 * stream is the better answer rather than a limitation.
 */

/** One half-open-free range, `start`..`end` INCLUSIVE — the form an HTTP `Range` header takes. */
export interface DownloadSegment {
  index: number;
  start: number;
  end: number;
}

/**
 * Below this, a segment is not worth a connection. One megabyte is roughly where the transfer time
 * starts to dominate the round trip on an ordinary link.
 */
export const MIN_SEGMENT_BYTES = 1024 * 1024;
/** Conservative on purpose: we are a browser, not a scraper. Raising it is a per-host user decision. */
export const MAX_DOWNLOAD_SEGMENTS = 8;

/**
 * The ranges to request, or an EMPTY array meaning "use a single stream".
 *
 * Empty is not a failure and is not an error — it is the ordinary answer for most downloads, and
 * returning it rather than a one-element plan keeps the caller's two paths honestly separate: one
 * stream is the existing `will-download` path, several is the segmented engine.
 */
export function planDownloadSegments(
  totalBytes: number | null,
  maxSegments = MAX_DOWNLOAD_SEGMENTS,
): DownloadSegment[] {
  // No `Content-Length` means no ranges to compute. A server that will not say how big a thing is
  // cannot be asked for the second half of it.
  if (totalBytes === null || !Number.isFinite(totalBytes) || totalBytes <= 0) return [];
  const cap = Math.max(1, Math.min(Math.trunc(maxSegments), MAX_DOWNLOAD_SEGMENTS));
  // Two full segments is the floor: splitting a 1.5 MB file into 1 MB + 0.5 MB spends a connection to
  // save nothing.
  const affordable = Math.floor(totalBytes / MIN_SEGMENT_BYTES);
  const count = Math.min(cap, affordable);
  if (count < 2) return [];

  const size = Math.floor(totalBytes / count);
  const segments: DownloadSegment[] = [];
  for (let index = 0; index < count; index++) {
    const start = index * size;
    // The remainder goes to the LAST segment rather than being spread: an even split that leaves a
    // stray byte unclaimed is the classic way to produce a file that is one byte short and passes
    // every length check that uses the same arithmetic.
    const end = index === count - 1 ? totalBytes - 1 : start + size - 1;
    segments.push({ index, start, end });
  }
  return segments;
}

/**
 * Whether a server will actually serve ranges, judged from what it said rather than from what it
 * advertised.
 *
 * `Accept-Ranges: bytes` is a claim; a `206` with a `Content-Range` is proof. Both are accepted here
 * because the probe happens before the first byte, but `Accept-Ranges: none` is treated as a refusal
 * whatever else is present — a server that says no is the one case where guessing costs a corrupt file
 * rather than a slow one.
 */
export function serverAcceptsRanges(input: {
  status: number;
  acceptRanges?: string | undefined;
  contentRange?: string | undefined;
}): boolean {
  const advertised = (input.acceptRanges ?? '').trim().toLowerCase();
  if (advertised === 'none') return false;
  if (input.status === 206 && (input.contentRange ?? '').length > 0) return true;
  return advertised === 'bytes';
}
