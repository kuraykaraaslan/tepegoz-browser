import { describe, expect, it } from 'vitest';
import { MIN_SEGMENT_BYTES } from './index';
import {
  runSegmentedTransfer,
  type SegmentResponse,
  type SegmentSink,
  type SegmentTransport,
} from './segmented-transfer';

const MB = MIN_SEGMENT_BYTES;

/** A file of deterministic bytes, so a wrongly-placed chunk is visible rather than plausible. */
function source(total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  for (let i = 0; i < total; i++) bytes[i] = i % 251;
  return bytes;
}

/** Writes into one buffer at absolute offsets — the in-memory stand-in for the quarantine file. */
function sinkOver(total: number): SegmentSink & { bytes: Uint8Array; writes: number } {
  const bytes = new Uint8Array(total);
  const sink = {
    bytes,
    writes: 0,
    write(offset: number, chunk: Uint8Array) {
      bytes.set(chunk, offset);
      sink.writes += 1;
      return Promise.resolve();
    },
  };
  return sink;
}

function chunked(bytes: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  // Real transports yield asynchronously; the `await` keeps this generator honestly async so a test
  // cannot pass on timing a `net.request` would not give it.
  return (async function* stream() {
    for (let at = 0; at < bytes.byteLength; at += size) {
      await Promise.resolve();
      yield bytes.subarray(at, Math.min(at + size, bytes.byteLength));
    }
  })();
}

/** A well-behaved ranged server. */
function goodTransport(file: Uint8Array, chunkSize = 64 * 1024): SegmentTransport {
  return {
    fetchRange({ start, end }): Promise<SegmentResponse> {
      return Promise.resolve({
        status: 206,
        headers: { acceptRanges: 'bytes', contentRange: `bytes ${start}-${end}/${file.byteLength}` },
        body: chunked(file.subarray(start, end + 1), chunkSize),
      });
    },
  };
}

describe('runSegmentedTransfer', () => {
  it('reassembles the file byte for byte', async () => {
    const total = 8 * MB + 137;
    const file = source(total);
    const sink = sinkOver(total);

    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: goodTransport(file),
      sink,
    });

    expect(result).toEqual({ ok: true, bytesWritten: total });
    // Not a length check — the actual bytes. A length check passes for a file assembled in the wrong
    // order, which is precisely the failure segmentation introduces.
    expect(Buffer.from(sink.bytes).equals(Buffer.from(file))).toBe(true);
  });

  it('reports progress as bytes land', async () => {
    const total = 4 * MB;
    const seen: number[] = [];
    await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: goodTransport(source(total)),
      sink: sinkOver(total),
      onProgress: (bytes) => seen.push(bytes),
    });
    expect(seen.length).toBeGreaterThan(1);
    // Monotonic, and ending at the total: a progress bar that goes backwards is a bug report.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(total);
  });

  it('refuses a server that answers a range request with the whole file', async () => {
    // A 200 here is not an HTTP error and is fatal to segmentation: writing a whole file at each
    // segment's offset scatters copies of it across itself.
    const total = 4 * MB;
    const file = source(total);
    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: {
        fetchRange: () =>
          Promise.resolve({ status: 200, headers: {}, body: chunked(file, 64 * 1024) }),
      },
      sink: sinkOver(total),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not-ranged');
  });

  it('fails the whole transfer when one segment ends early', async () => {
    // A partial result is never a result. Eight-ninths of a file is worse than none, because the
    // failure is invisible until someone opens it.
    const total = 4 * MB;
    const file = source(total);
    const good = goodTransport(file);
    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: {
        async fetchRange(input) {
          const response = await good.fetchRange(input);
          if (input.start === 0) {
            return { ...response, body: chunked(file.subarray(0, 1_000), 500) };
          }
          return response;
        },
      },
      sink: sinkOver(total),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('segment-short');
  });

  it('fails when a segment sends MORE than it was asked for', async () => {
    const total = 4 * MB;
    const file = source(total);
    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: {
        fetchRange: ({ start, end }) =>
          Promise.resolve({
            status: 206,
            headers: { contentRange: `bytes ${start}-${end}/${total}` },
            // One byte past the range. Truncating would hide a server not honouring ranges.
            body: chunked(file.subarray(start, end + 2), 64 * 1024),
          }),
      },
      sink: sinkOver(total),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('segment-overrun');
  });

  it('fails when a connection throws rather than returning', async () => {
    const total = 4 * MB;
    const file = source(total);
    const good = goodTransport(file);
    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: {
        fetchRange: (input) =>
          input.start === 0 ? Promise.reject(new Error('ECONNRESET')) : good.fetchRange(input),
      },
      sink: sinkOver(total),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('segment-failed');
  });

  it('tells the caller to use one stream rather than pretending to fail', async () => {
    // A file too small to segment is the ordinary case, and `not-ranged` is how the caller learns to
    // take the single-stream path. It is not a download failure.
    const result = await runSegmentedTransfer({
      url: 'https://x/small.bin',
      totalBytes: 1_000,
      transport: goodTransport(source(1_000)),
      sink: sinkOver(1_000),
    });
    expect(result).toEqual({ ok: false, bytesWritten: 0, error: 'not-ranged' });
  });

  it('never reports ok when the totals disagree, even if every segment thought it finished', async () => {
    // Belt and braces: either check alone has been enough to ship a truncated file in somebody's
    // downloader. Here the transport lies about the size by serving a shorter file.
    const total = 4 * MB;
    const result = await runSegmentedTransfer({
      url: 'https://x/file.bin',
      totalBytes: total,
      transport: goodTransport(source(total - 1)),
      sink: sinkOver(total),
    });
    expect(result.ok).toBe(false);
  });
});
