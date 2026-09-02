// Imported from the module rather than the package barrel: the barrel re-exports THIS file, and a
// static cycle through it is what `dependency-cruiser`'s no-circular rule exists to catch.
import {
  planDownloadSegments,
  serverAcceptsRanges,
  type DownloadSegment,
} from './download-segments';

/**
 * The segmented transfer itself — everything except the wire and the disk.
 *
 * Both of those are injected, which is not a style choice. The real transport has to be Electron's
 * `net.request` on the transfer's own browsing session (that session is what carries the cookies, the
 * proxy and the Phase 5 tunnel — a bare HTTP client would quietly take a download off the route the
 * user chose), and the real sink writes into the quarantine file. Neither can run in a unit test, and
 * the interesting failures are all HERE: a server that answers a range request with the whole file, a
 * segment that returns fewer bytes than it promised, one connection dying while five are in flight.
 *
 * The rule this module exists to enforce: **a partial result is never a result.** If any segment fails
 * or disagrees with what was asked for, the whole transfer fails and the file is not offered. A
 * segmented download that silently kept eight-ninths of a file would be worse than one that never
 * started, because the failure is invisible until someone opens it.
 */

/** One ranged response. `body` is consumed once, in order. */
export interface SegmentResponse {
  status: number;
  headers: { acceptRanges?: string | undefined; contentRange?: string | undefined };
  body: AsyncIterable<Uint8Array>;
}

export interface SegmentTransport {
  fetchRange(input: { url: string; start: number; end: number }): Promise<SegmentResponse>;
}

/** Where the bytes go. `write` must place `chunk` at exactly `offset` — never append. */
export interface SegmentSink {
  write(offset: number, chunk: Uint8Array): Promise<void>;
}

export interface SegmentedTransferResult {
  ok: boolean;
  bytesWritten: number;
  /** Present when `ok` is false. Named so a caller can log a cause without inventing prose. */
  error?:
    | 'not-ranged'
    | 'segment-failed'
    | 'segment-short'
    | 'segment-overrun'
    | 'aborted';
}

export interface SegmentedTransferInput {
  url: string;
  totalBytes: number;
  transport: SegmentTransport;
  sink: SegmentSink;
  maxSegments?: number | undefined;
  /** Called with the running total of bytes written, for the progress row. */
  onProgress?: ((bytesWritten: number) => void) | undefined;
}

/**
 * Run the whole transfer. Resolves `ok: false` rather than throwing — a failed download is an outcome
 * the manager displays, not an exception the caller has to translate.
 *
 * Returns `ok: false, error: 'not-ranged'` when segmentation was never appropriate or the server
 * refused ranges, which is the caller's signal to use a single stream. That is not a failure of the
 * download; it is the ordinary path.
 */
export async function runSegmentedTransfer(
  input: SegmentedTransferInput,
): Promise<SegmentedTransferResult> {
  const segments = planDownloadSegments(input.totalBytes, input.maxSegments);
  if (segments.length === 0) return { ok: false, bytesWritten: 0, error: 'not-ranged' };

  let written = 0;
  let failure: SegmentedTransferResult['error'] | null = null;
  const report = (): void => input.onProgress?.(written);

  const runOne = async (segment: DownloadSegment): Promise<void> => {
    const response = await input.transport.fetchRange({
      url: input.url,
      start: segment.start,
      end: segment.end,
    });
    // A 200 to a range request means the server is sending the WHOLE file down every connection. It
    // is not an error to the HTTP layer and it is fatal here: writing that at a segment's offset
    // would scatter copies of the file across itself.
    if (
      !serverAcceptsRanges({
        status: response.status,
        acceptRanges: response.headers.acceptRanges,
        contentRange: response.headers.contentRange,
      })
    ) {
      failure ??= 'not-ranged';
      return;
    }

    let offset = segment.start;
    for await (const chunk of response.body) {
      if (failure !== null) return; // another segment already lost; stop reading this one
      if (offset + chunk.byteLength > segment.end + 1) {
        // More bytes than the range asked for. Truncating would hide a server that is not honouring
        // ranges; the transfer is abandoned instead.
        failure ??= 'segment-overrun';
        return;
      }
      await input.sink.write(offset, chunk);
      offset += chunk.byteLength;
      written += chunk.byteLength;
      report();
    }
    if (failure === null && offset !== segment.end + 1) {
      // The connection ended early. `written` already counts what arrived, which is exactly why the
      // byte total alone cannot be trusted as a completion test.
      failure ??= 'segment-short';
    }
  };

  const results = await Promise.allSettled(segments.map((segment) => runOne(segment)));
  if (results.some((r) => r.status === 'rejected')) failure ??= 'segment-failed';

  if (failure !== null) return { ok: false, bytesWritten: written, error: failure };
  // Belt and braces: every segment reported complete AND the totals agree. Either alone has been
  // enough to ship a truncated file in somebody's downloader.
  if (written !== input.totalBytes) return { ok: false, bytesWritten: written, error: 'segment-short' };
  return { ok: true, bytesWritten: written };
}
