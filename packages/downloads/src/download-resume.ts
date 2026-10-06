import type { DownloadRecord } from './download-types';

/**
 * What a resume across an app restart may safely do.
 *
 * Electron can restart an interrupted transfer with `session.createInterruptedDownload`, and it will
 * happily continue writing at whatever offset it is handed. That is the whole hazard: a partial file
 * plus a byte range from a DIFFERENT version of the resource produces a file that is corrupt in a way
 * nothing downstream can detect — the hash is computed over the splice, so it merely disagrees with
 * every other copy in the world without saying why.
 *
 * So a resume is allowed only when three things line up, and anything else RESTARTS. A restart costs
 * bandwidth; a bad splice costs correctness, and the user cannot tell it happened.
 */
export type DownloadResumeAction = 'resume' | 'restart';

export interface DownloadResumePlan {
  action: DownloadResumeAction;
  /** Byte offset to continue from. Always 0 for a restart. */
  offset: number;
  /** Why, in a form a log or a test can assert on. */
  reason:
    | 'ok'
    | 'no-partial-file'
    | 'byte-count-disagrees'
    | 'no-validator'
    | 'already-complete'
    | 'not-resumable';
}

/**
 * Decide between resuming and restarting.
 *
 * `bytesOnDisk` is what the quarantine file ACTUALLY holds, measured by the caller — not what the
 * record remembers. The two disagreeing is the interesting case: a crash mid-write, a truncated file,
 * a disk that lost the tail. Trusting the record there is precisely "blindly appending".
 */
export function planDownloadResume(
  record: Pick<DownloadRecord, 'receivedBytes' | 'totalBytes' | 'canResume'> & {
    etag?: string | null | undefined;
    lastModified?: string | null | undefined;
  },
  bytesOnDisk: number,
): DownloadResumePlan {
  const restart = (reason: DownloadResumePlan['reason']): DownloadResumePlan => ({
    action: 'restart',
    offset: 0,
    reason,
  });

  if (!record.canResume) return restart('not-resumable');
  if (bytesOnDisk <= 0) return restart('no-partial-file');
  // The record and the disk must agree to the byte. They are written at different moments, and a
  // mismatch means one of them is describing a file that no longer exists in that form.
  if (bytesOnDisk !== record.receivedBytes) return restart('byte-count-disagrees');
  if (record.totalBytes !== null && bytesOnDisk >= record.totalBytes) {
    // Everything is already here. Resuming would ask for a range past the end; restarting would
    // re-download a complete file. Neither is right, so the caller finishes it instead.
    return restart('already-complete');
  }
  // No `ETag` and no `Last-Modified` means the server offered no way to tell whether the bytes we
  // hold came from the same resource. A range request would still succeed and still be wrong.
  const hasValidator = (record.etag ?? '').length > 0 || (record.lastModified ?? '').length > 0;
  if (!hasValidator) return restart('no-validator');

  return { action: 'resume', offset: bytesOnDisk, reason: 'ok' };
}
