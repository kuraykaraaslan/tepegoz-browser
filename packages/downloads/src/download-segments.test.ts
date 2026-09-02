import { describe, expect, it } from 'vitest';
import {
  MAX_DOWNLOAD_SEGMENTS,
  MIN_SEGMENT_BYTES,
  planDownloadSegments,
  serverAcceptsRanges,
  type DownloadSegment,
} from './index';

const MB = MIN_SEGMENT_BYTES;

/** Every byte from 0..total-1 claimed exactly once, in order. The property the whole engine rests on. */
function coversExactly(segments: DownloadSegment[], total: number): boolean {
  if (segments.length === 0) return false;
  let expected = 0;
  for (const [i, segment] of segments.entries()) {
    if (segment.index !== i) return false;
    if (segment.start !== expected) return false;
    if (segment.end < segment.start) return false;
    expected = segment.end + 1;
  }
  return expected === total;
}

describe('planDownloadSegments', () => {
  it('covers every byte exactly once, with no gap and no overlap', () => {
    // A gap is a corrupt file; an overlap is a corrupt file written twice. Both survive a length
    // check when the check uses the same arithmetic that produced them, so this is asserted directly.
    for (const total of [2 * MB, 3 * MB, 8 * MB, 8 * MB + 1, 17 * MB - 3, 100 * MB + 7]) {
      const segments = planDownloadSegments(total);
      expect(coversExactly(segments, total), `total ${String(total)}`).toBe(true);
    }
  });

  it('gives the remainder to the LAST segment rather than spreading it', () => {
    const segments = planDownloadSegments(8 * MB + 5, 4);
    expect(segments).toHaveLength(4);
    const last = segments.at(-1)!;
    expect(last.end).toBe(8 * MB + 4);
    // The stray bytes land in one place, which is the difference between a file that is complete and
    // one that is five bytes short.
    expect(last.end - last.start + 1).toBeGreaterThan(segments[0]!.end - segments[0]!.start + 1);
  });

  it('uses a single stream for a small file', () => {
    // Splitting here spends connections to save nothing, and the handshakes cost more than the bytes.
    expect(planDownloadSegments(1)).toEqual([]);
    expect(planDownloadSegments(MB)).toEqual([]);
    expect(planDownloadSegments(2 * MB - 1)).toEqual([]);
  });

  it('uses a single stream when the size is unknown', () => {
    // A server that will not say how big a thing is cannot be asked for the second half of it.
    expect(planDownloadSegments(null)).toEqual([]);
    expect(planDownloadSegments(Number.NaN)).toEqual([]);
    expect(planDownloadSegments(-5)).toEqual([]);
  });

  it('never opens more connections than the ceiling, however large the file', () => {
    // "We are a browser, not a scraper" has to be enforced, not just written down.
    expect(planDownloadSegments(10_000 * MB).length).toBe(MAX_DOWNLOAD_SEGMENTS);
    expect(planDownloadSegments(10_000 * MB, 64).length).toBe(MAX_DOWNLOAD_SEGMENTS);
  });

  it('honours a smaller caller ceiling', () => {
    expect(planDownloadSegments(64 * MB, 3)).toHaveLength(3);
    // A caller asking for one segment is asking for a single stream, and gets the empty plan that
    // means exactly that rather than a one-element plan the engine would have to special-case.
    expect(planDownloadSegments(64 * MB, 1)).toEqual([]);
    expect(planDownloadSegments(64 * MB, 0)).toEqual([]);
  });

  it('never plans a segment smaller than the minimum', () => {
    for (const total of [2 * MB, 5 * MB, 9 * MB + 1]) {
      for (const segment of planDownloadSegments(total)) {
        expect(segment.end - segment.start + 1).toBeGreaterThanOrEqual(MB);
      }
    }
  });
});

describe('serverAcceptsRanges', () => {
  it('takes a 206 with Content-Range as proof', () => {
    expect(
      serverAcceptsRanges({ status: 206, contentRange: 'bytes 0-1023/4096' }),
    ).toBe(true);
  });

  it('accepts the advertisement on its own', () => {
    expect(serverAcceptsRanges({ status: 200, acceptRanges: 'bytes' })).toBe(true);
    expect(serverAcceptsRanges({ status: 200, acceptRanges: 'BYTES' })).toBe(true);
  });

  it('treats an explicit "none" as a refusal, whatever else is present', () => {
    // A server that says no is the one case where guessing costs a corrupt file rather than a slow
    // one, so the refusal outranks a 206 that came from somewhere else in the chain.
    expect(serverAcceptsRanges({ status: 206, acceptRanges: 'none', contentRange: 'bytes 0-1/2' })).toBe(
      false,
    );
  });

  it('says no when the server said nothing', () => {
    expect(serverAcceptsRanges({ status: 200 })).toBe(false);
    expect(serverAcceptsRanges({ status: 206 })).toBe(false);
  });
});
