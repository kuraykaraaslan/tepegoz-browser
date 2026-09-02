import { createHash, randomUUID } from 'node:crypto';
import { open, mkdtemp, rm } from 'node:fs/promises';
import { createServer, get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIN_SEGMENT_BYTES, planDownloadSegments } from './index';
import {
  runSegmentedTransfer,
  type SegmentSink,
  type SegmentTransport,
} from './segmented-transfer';

/**
 * The segmented engine, driven over a REAL loopback HTTP server and a REAL file on disk.
 *
 * `segmented-transfer.test.ts` next to this one exercises the orchestration with hand-built transports
 * — every failure mode (a 200 to a range request, a short segment, an overrun, a thrown connection).
 * This file does the other half the phase row asks for:
 *
 *  1. **A real range server** — `Range:` in, `206` + `Content-Range` out, a single `200` when no range
 *     is asked for, and an `Accept-Ranges: none` mode that must push the caller back to one stream.
 *     This is the harness the `DownloadService` wiring also needs; it lives here so it exists before
 *     that fork is taken.
 *  2. **A reference `SegmentTransport`/`SegmentSink` over `node:http` + a `FileHandle`** — the exact
 *     shape the desktop host will implement with Electron's `net.request` and the quarantine file.
 *     Proving it here means the host side is a transcription, not a design.
 *  3. **"Measurement, not assertion"** (the open Phase 2c row) — a benchmark that pulls a fixed set of
 *     files single-stream and segmented against a throughput-capped server and RECORDS the numbers.
 *     It asserts correctness only; a speed claim is allowed to cite what this prints, nothing more.
 */

// ---------------------------------------------------------------------------
// A file of deterministic bytes, so a chunk written at the wrong offset is visible, not plausible.
// ---------------------------------------------------------------------------
function makeFile(total: number): Buffer {
  const bytes = Buffer.allocUnsafe(total);
  for (let i = 0; i < total; i++) bytes[i] = (i * 2654435761) & 0xff;
  return bytes;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface RangeServerOptions {
  /** Bytes/second ceiling PER connection. Undefined means as fast as the loopback allows. */
  throttleBytesPerSec?: number;
  /** Answer every request with a plain `200` + `Accept-Ranges: none`, ignoring `Range:`. */
  refuseRanges?: boolean;
}

interface RunningServer {
  base: string;
  /** How many requests carried a `Range:` header — the tell that segmentation actually happened. */
  rangedRequests(): number;
  close(): Promise<void>;
}

/** Serve `file` with honest range semantics (or honest refusal). One per test; closed in afterEach. */
async function startRangeServer(file: Buffer, options: RangeServerOptions = {}): Promise<RunningServer> {
  let ranged = 0;
  const server: Server = createServer((req, res) => {
    const rangeHeader = req.headers.range;
    void (async (): Promise<void> => {
      let start = 0;
      let end = file.byteLength - 1;
      let status = 200;
      if (rangeHeader !== undefined && !(options.refuseRanges ?? false)) {
        ranged += 1;
        const match = /^bytes=(\d+)-(\d+)$/u.exec(rangeHeader.trim());
        if (match !== null) {
          start = Number(match[1]);
          end = Number(match[2]);
          status = 206;
        }
      }
      const slice = file.subarray(start, end + 1);
      res.writeHead(status, {
        'content-type': 'application/octet-stream',
        'content-length': String(slice.byteLength),
        'accept-ranges': (options.refuseRanges ?? false) ? 'none' : 'bytes',
        ...(status === 206
          ? { 'content-range': `bytes ${start}-${end}/${file.byteLength}` }
          : {}),
      });
      const throttle = options.throttleBytesPerSec;
      if (throttle === undefined) {
        res.end(slice);
        return;
      }
      // Pace the body so parallel connections have something to win. 64 KiB at a time, waiting the
      // wall-clock cost of those bytes at the cap before the next write.
      const step = 64 * 1024;
      for (let at = 0; at < slice.byteLength; at += step) {
        res.write(slice.subarray(at, Math.min(at + step, slice.byteLength)));
        await delay((Math.min(step, slice.byteLength - at) / throttle) * 1000);
      }
      res.end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${String(port)}`,
    rangedRequests: () => ranged,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

/**
 * The reference transport. A `net.request` implementation in the desktop host is the same function
 * with a different client — resolve on the response, hand the response stream straight back as `body`.
 */
function httpRangeTransport(base: string): SegmentTransport {
  return {
    fetchRange({ url, start, end }) {
      return new Promise((resolve, reject) => {
        const request = get(
          `${base}${url}`,
          { headers: { Range: `bytes=${String(start)}-${String(end)}` } },
          (response) => {
            resolve({
              status: response.statusCode ?? 0,
              headers: {
                acceptRanges: response.headers['accept-ranges'],
                contentRange: response.headers['content-range'],
              },
              body: response,
            });
          },
        );
        request.on('error', reject);
      });
    },
  };
}

/** The reference sink: positional writes into one file handle — never an append. */
function fileSink(handle: Awaited<ReturnType<typeof open>>): SegmentSink {
  return {
    async write(offset, chunk) {
      await handle.write(chunk, 0, chunk.byteLength, offset);
    },
  };
}

/** One GET, straight to a file. The single-stream baseline the segmented path is measured against. */
async function singleStreamDownload(url: string, destination: string): Promise<void> {
  const handle = await open(destination, 'w');
  try {
    await new Promise<void>((resolve, reject) => {
      const request = get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`baseline expected 200, got ${String(response.statusCode)}`));
          return;
        }
        let offset = 0;
        response.on('data', (chunk: Buffer) => {
          void handle.write(chunk, 0, chunk.byteLength, offset);
          offset += chunk.byteLength;
        });
        response.on('end', resolve);
        response.on('error', reject);
      });
      request.on('error', reject);
    });
  } finally {
    await handle.close();
  }
}

/**
 * What the `DownloadService` caller will do: try to segment, and take that as the signal to fall back
 * to one stream when it is not worthwhile. `not-ranged` is the ordinary answer, not a failure.
 */
async function downloadThroughEngine(
  base: string,
  totalBytes: number,
  destination: string,
): Promise<{ ok: boolean; segmented: boolean }> {
  const handle = await open(destination, 'w');
  try {
    const result = await runSegmentedTransfer({
      url: '/file.bin',
      totalBytes,
      transport: httpRangeTransport(base),
      sink: fileSink(handle),
    });
    if (result.ok) return { ok: true, segmented: true };
    if (result.error === 'not-ranged') {
      await handle.truncate(0);
      await singleStreamDownload(`${base}/file.bin`, destination);
      return { ok: true, segmented: false };
    }
    return { ok: false, segmented: true };
  } finally {
    await handle.close();
  }
}

const MB = MIN_SEGMENT_BYTES;
let workdir: string | null = null;
const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  if (workdir !== null) {
    await rm(workdir, { recursive: true, force: true });
    workdir = null;
  }
});

async function scratch(): Promise<string> {
  workdir ??= await mkdtemp(join(tmpdir(), 'tepegoz-seg-'));
  return join(workdir, randomUUID());
}

describe('runSegmentedTransfer over real HTTP', () => {
  // A fixed set of sizes: one too small to segment (must fall back), two that segment for real,
  // including a size with an awkward remainder that the last segment has to absorb.
  const SIZES: { label: string; bytes: number; expectSegmented: boolean }[] = [
    { label: '256 KiB', bytes: 256 * 1024, expectSegmented: false },
    { label: '3 MiB', bytes: 3 * MB, expectSegmented: true },
    { label: '8 MiB + 137', bytes: 8 * MB + 137, expectSegmented: true },
  ];

  for (const size of SIZES) {
    it(`reassembles ${size.label} byte-for-byte, matching a single-stream pull`, async () => {
      const file = makeFile(size.bytes);
      const server = await startRangeServer(file);
      servers.push(server);

      const viaEngine = await scratch();
      const viaStream = await scratch();
      const engineResult = await downloadThroughEngine(server.base, size.bytes, viaEngine);
      await singleStreamDownload(`${server.base}/file.bin`, viaStream);

      expect(engineResult).toEqual({ ok: true, segmented: size.expectSegmented });

      const engineBytes = await open(viaEngine).then((h) => h.readFile().finally(() => h.close()));
      const streamBytes = await open(viaStream).then((h) => h.readFile().finally(() => h.close()));
      // The actual bytes, not the length — a file assembled in the wrong order passes a length check,
      // and wrong order is the one failure segmentation introduces that a single stream never can.
      expect(sha256(engineBytes)).toBe(sha256(file));
      expect(sha256(streamBytes)).toBe(sha256(file));

      if (size.expectSegmented) {
        // planDownloadSegments decided how many; every one of them should have carried a Range.
        expect(server.rangedRequests()).toBe(planDownloadSegments(size.bytes).length);
      } else {
        expect(server.rangedRequests()).toBe(0);
      }
    });
  }

  it('falls back to a single stream when the server answers Accept-Ranges: none', async () => {
    const total = 6 * MB;
    const file = makeFile(total);
    const server = await startRangeServer(file, { refuseRanges: true });
    servers.push(server);

    const destination = await scratch();
    const result = await downloadThroughEngine(server.base, total, destination);

    expect(result).toEqual({ ok: true, segmented: false });
    const bytes = await open(destination).then((h) => h.readFile().finally(() => h.close()));
    expect(sha256(bytes)).toBe(sha256(file));
  });

  it('MEASUREMENT — records single-stream vs segmented throughput against a capped server', async () => {
    // The point of this row is the NUMBER, not a pass/fail on speed: loopback timing is too noisy to
    // gate on, and the honest finding is conditional anyway (segmentation is pure overhead on a fast
    // link and wins on a throughput-capped or high-latency one). So the server is capped per
    // connection, both paths run, and the table is printed for a speed claim to cite.
    const CAP_BYTES_PER_SEC = 4 * 1024 * 1024;
    const cases = [3 * MB, 6 * MB];
    const rows: Record<string, unknown>[] = [];

    for (const total of cases) {
      const file = makeFile(total);
      const server = await startRangeServer(file, { throttleBytesPerSec: CAP_BYTES_PER_SEC });
      servers.push(server);

      const streamDest = await scratch();
      const t0 = performance.now();
      await singleStreamDownload(`${server.base}/file.bin`, streamDest);
      const streamMs = performance.now() - t0;

      const engineDest = await scratch();
      const t1 = performance.now();
      const engineResult = await downloadThroughEngine(server.base, total, engineDest);
      const engineMs = performance.now() - t1;

      // Correctness is the only hard gate. Both files must be the original, to the byte.
      const streamBytes = await open(streamDest).then((h) => h.readFile().finally(() => h.close()));
      const engineBytes = await open(engineDest).then((h) => h.readFile().finally(() => h.close()));
      expect(sha256(streamBytes)).toBe(sha256(file));
      expect(sha256(engineBytes)).toBe(sha256(file));
      expect(engineResult).toEqual({ ok: true, segmented: true });

      const mbps = (ms: number): number => Number(((total / (ms / 1000)) / (1024 * 1024)).toFixed(2));
      rows.push({
        size: `${(total / MB).toFixed(0)} MiB`,
        segments: planDownloadSegments(total).length,
        singleStreamMs: Math.round(streamMs),
        segmentedMs: Math.round(engineMs),
        singleStreamMBps: mbps(streamMs),
        segmentedMBps: mbps(engineMs),
        speedup: Number((streamMs / engineMs).toFixed(2)),
      });
    }

    // This test's product is this table.
    console.log(
      `SEGMENTED THROUGHPUT (server capped at ${CAP_BYTES_PER_SEC / (1024 * 1024)} MB/s per connection):\n` +
        JSON.stringify(rows, null, 2),
    );
    expect(rows).toHaveLength(cases.length);
  });
});
