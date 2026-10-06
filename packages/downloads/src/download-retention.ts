import type { DownloadRecord } from './download-types';

/**
 * How long a finished download stays in the LIST. The file on disk is never involved.
 *
 * `manual` is the default and the only policy that never deletes on its own: a download list that
 * quietly empties itself is one the user cannot use to answer "did I actually download that?", which
 * is most of what the list is for.
 */
export const DOWNLOAD_RETENTION_POLICIES = ['manual', 'after-day', 'on-completion'] as const;
export type DownloadRetentionPolicy = (typeof DOWNLOAD_RETENTION_POLICIES)[number];

/** A day, as the retention policy means it. */
const RETENTION_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which records the retention policy would remove from the list, by id.
 *
 * Pure, so the rule is testable without a database or a clock, and because the two callers (startup
 * sweep and post-completion sweep) must not be able to disagree about it.
 *
 * Three rules hold for every policy:
 *
 *  - **Only terminal records.** A transfer in flight is not history; its row is what tracks it, and
 *    removing that would leave a download nothing is watching.
 *  - **Never a quarantined record.** It is terminal in the sense that no bytes are moving, but the
 *    file is still sitting in quarantine waiting for a release decision — dropping the row would
 *    strand the file with no way to reach it from the UI.
 *  - **Never a blocked or failed one under `on-completion`.** "As soon as they finish" means finished
 *    SUCCESSFULLY; a download that failed is exactly the one the user comes back to look for.
 */
export function downloadsToForget(
  records: readonly DownloadRecord[],
  policy: DownloadRetentionPolicy,
  now: number,
): string[] {
  if (policy === 'manual') return [];
  return records
    .filter((record) => {
      if (record.status === 'completed') {
        return policy === 'on-completion' || now - record.updatedAt >= RETENTION_DAY_MS;
      }
      // `after-day` sweeps the whole terminal set, because a week-old failed attempt is clutter by
      // then; `on-completion` deliberately keeps them.
      if (policy !== 'after-day') return false;
      return (
        (record.status === 'canceled' ||
          record.status === 'failed' ||
          record.status === 'blocked') &&
        now - record.updatedAt >= RETENTION_DAY_MS
      );
    })
    .map((record) => record.id);
}
