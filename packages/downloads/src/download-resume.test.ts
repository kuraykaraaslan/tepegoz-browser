import { describe, expect, it } from 'vitest';
import { planDownloadResume } from './index';

/**
 * The rule that decides between continuing a partial download and starting it again.
 *
 * The failure this exists to prevent has no symptom. Electron will continue writing at whatever offset
 * it is handed; if the bytes already on disk came from a different version of the resource, the
 * finished file is a splice of two documents. The hash is computed over the splice, so nothing
 * downstream reports anything — the file simply disagrees with every other copy in the world, and the
 * user finds out when they open it, if ever.
 *
 * So every case below is a case where resuming is CHEAPER and restarting is CORRECT.
 */
const RESUMABLE = {
  receivedBytes: 500,
  totalBytes: 1_000,
  canResume: true,
  etag: 'W/"abc"',
  lastModified: 'Mon, 01 Sep 2026 10:00:00 GMT',
};

describe('planDownloadResume', () => {
  it('resumes from exactly what the disk holds', () => {
    expect(planDownloadResume(RESUMABLE, 500)).toEqual({
      action: 'resume',
      offset: 500,
      reason: 'ok',
    });
  });

  it('restarts when the disk and the record disagree by even one byte', () => {
    // The two are written at different moments; a mismatch means one of them describes a file that no
    // longer exists in that form. Trusting the record here is the definition of blindly appending.
    expect(planDownloadResume(RESUMABLE, 499).action).toBe('restart');
    expect(planDownloadResume(RESUMABLE, 501)).toMatchObject({ reason: 'byte-count-disagrees' });
  });

  it('restarts when there is no validator, however tidy the byte counts are', () => {
    // No ETag and no Last-Modified means the server offered no way to tell whether what we hold came
    // from the same resource. The range request would succeed and still be wrong.
    const noValidator = { ...RESUMABLE, etag: undefined, lastModified: undefined };
    expect(planDownloadResume(noValidator, 500)).toMatchObject({ reason: 'no-validator' });
  });

  it('accepts either validator on its own', () => {
    expect(planDownloadResume({ ...RESUMABLE, etag: undefined }, 500).action).toBe('resume');
    expect(planDownloadResume({ ...RESUMABLE, lastModified: undefined }, 500).action).toBe('resume');
  });

  it('treats an empty-string validator as no validator', () => {
    // A stored `''` is what "the server sent no header" looks like after a round trip through SQLite.
    expect(
      planDownloadResume({ ...RESUMABLE, etag: '', lastModified: '' }, 500).reason,
    ).toBe('no-validator');
  });

  it('restarts when nothing is on disk, including an unreadable file', () => {
    expect(planDownloadResume(RESUMABLE, 0)).toMatchObject({ reason: 'no-partial-file' });
    // The reader reports -1 for a file it could not stat; that is not a zero-length file.
    expect(planDownloadResume(RESUMABLE, -1)).toMatchObject({ reason: 'no-partial-file' });
  });

  it('refuses a record the server never said was resumable', () => {
    expect(planDownloadResume({ ...RESUMABLE, canResume: false }, 500)).toMatchObject({
      reason: 'not-resumable',
    });
  });

  it('says so when every byte is already there, rather than asking for a range past the end', () => {
    expect(planDownloadResume({ ...RESUMABLE, receivedBytes: 1_000 }, 1_000)).toMatchObject({
      reason: 'already-complete',
    });
  });

  it('still resumes when the total size is unknown', () => {
    // A server without Content-Length can still support ranges, and refusing here would give up on
    // every chunked transfer.
    const noTotal = { ...RESUMABLE, totalBytes: null };
    expect(planDownloadResume(noTotal, 500).action).toBe('resume');
  });

  it('never returns a non-zero offset with a restart', () => {
    // A restart that carried an offset would be a resume wearing the wrong name — and the caller
    // passes this straight to `createInterruptedDownload`.
    for (const bytes of [-1, 0, 1, 499, 501, 1_000]) {
      const plan = planDownloadResume(RESUMABLE, bytes);
      if (plan.action === 'restart') expect(plan.offset).toBe(0);
    }
  });
});
