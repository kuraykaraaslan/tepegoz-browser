import { statSync } from 'node:fs';
import { planDownloadResume, type DownloadResumePlan } from '@tepegoz/downloads';
import { AppError, Logger } from '@tepegoz/libs';
import { DIRECT_PARTITION } from '@tepegoz/tab-engine';
import BrowsingSessions from '../network/browsing-sessions.electron';
import type { ActiveDownload } from './download-service-model.electron';
import { patch, type DownloadState } from './download-service-store.electron';

/**
 * Resuming a transfer whose `DownloadItem` no longer exists — the app was restarted, or the item was
 * torn down with the session that owned it.
 *
 * Before this, `resume` set the row to `in_progress` and, with no live item, did nothing at all. A
 * button that reports success and moves no bytes is worse than a disabled one: the user goes away and
 * comes back to a transfer that never started.
 *
 * Two properties make this safe to do at all:
 *
 *  - **The bytes on disk are measured, not remembered.** `planDownloadResume` compares the actual file
 *    size against the record and refuses to continue when they disagree — a crash mid-write, a
 *    truncated file, a lost tail. Handing Electron an offset the file does not support is exactly
 *    "blindly appending", and it produces a corrupt file nothing downstream can detect: the hash is
 *    computed over the splice, so it merely disagrees with every other copy in the world.
 *  - **The route is the one it was on.** A tunnel-bound transfer resumes on its own partition, never
 *    on Direct. Resuming a Tor-routed download over the clear path would be the leak the tab model
 *    exists to prevent, and it would happen silently.
 */
export function resumeInterrupted(state: DownloadState, record: ActiveDownload): DownloadResumePlan {
  const plan = planDownloadResume(record, bytesOnDisk(record));
  if (plan.action !== 'resume') {
    Logger.info('Download cannot be resumed as-is', { id: record.id, reason: plan.reason });
    return plan;
  }
  if (record.quarantinePath === undefined) return { action: 'restart', offset: 0, reason: 'no-partial-file' };

  const partition = record.partition ?? DIRECT_PARTITION;
  const ses = BrowsingSessions.ensure(partition);
  ses.createInterruptedDownload({
    path: record.quarantinePath,
    // The full chain, redirects included: resuming the first URL can land somewhere else entirely.
    urlChain: record.urlChain !== undefined && record.urlChain.length > 0 ? record.urlChain : [record.url],
    offset: plan.offset,
    length: record.totalBytes ?? 0,
    ...(record.lastModified !== undefined ? { lastModified: record.lastModified } : {}),
    ...(record.etag !== undefined ? { eTag: record.etag } : {}),
    startTime: Math.floor(record.createdAt / 1000),
  });
  // The new item arrives through `will-download` on that session, which is what re-attaches progress,
  // the quarantine path and the trust gate — nothing here bypasses them.
  patch(state, record.id, { status: 'in_progress' });
  return plan;
}

/** What the partial file actually holds. `-1` when it cannot be read, which the planner treats as
 *  "no partial file" rather than as a zero-length one. */
function bytesOnDisk(record: ActiveDownload): number {
  if (record.quarantinePath === undefined) return -1;
  try {
    return statSync(record.quarantinePath).size;
  } catch {
    return -1;
  }
}

/**
 * The error a caller raises when a resume cannot proceed, phrased for the user rather than for the
 * protocol. Kept here so the reason strings and the messages cannot drift apart.
 */
export function resumeRefusal(plan: DownloadResumePlan): AppError {
  if (plan.reason === 'already-complete') {
    return new AppError('This download already has every byte', 409, 'downloadAlreadyComplete');
  }
  return new AppError(
    'This download cannot be resumed and has to start again',
    409,
    'downloadMustRestart',
  );
}
