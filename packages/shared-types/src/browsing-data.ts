import { z } from 'zod';

/**
 * "Clear browsing data" — the unified dialog (Phase 2c L8).
 *
 * Before this the browser could clear history, clear the download list, and forget one site, in three
 * different places with three different shapes. Chrome, Edge, Firefox and Safari all put the whole set
 * behind one dialog with a time range, and the reason is not tidiness: a person who wants to remove the
 * last hour of their browsing has to be able to do it in one action, or they will do part of it and
 * believe they did all of it.
 */

/** Time ranges, matching what every other browser offers. */
export const BROWSING_DATA_RANGES = [
  'last-hour',
  'last-day',
  'last-week',
  'last-4-weeks',
  'all-time',
] as const;
export const BrowsingDataRangeSchema = z.enum(BROWSING_DATA_RANGES);
export type BrowsingDataRange = z.infer<typeof BrowsingDataRangeSchema>;

/**
 * What can be cleared.
 *
 * Deliberately NOT here: saved passwords. They are user-authored data that outlives a browsing session,
 * and the per-site clear already refuses to touch the vault for the same reason — deleting a credential
 * is a different act from clearing a trace, and it has to be asked for separately, where it can be
 * confirmed on its own terms. Chrome offers it in this dialog; this is a considered deviation, not an
 * omission, and Settings has its own place to delete a saved login.
 *
 * `agentHistory` has no counterpart in another browser because no other browser has it. It is the
 * record of what the user typed at the agent, which is browsing data by any honest reading of the
 * phrase, and leaving it out of the one dialog people go to would make that dialog a half-truth.
 */
export const BROWSING_DATA_CATEGORIES = [
  'history',
  'downloads',
  'cookies',
  'cache',
  'agentHistory',
] as const;
export const BrowsingDataCategorySchema = z.enum(BROWSING_DATA_CATEGORIES);
export type BrowsingDataCategory = z.infer<typeof BrowsingDataCategorySchema>;

/**
 * The categories a time range can actually be applied to.
 *
 * This is a property of the engine, not a design choice. Rows this app stores carry a timestamp, so a
 * range is a `WHERE` clause. Cookies, site storage and the HTTP cache live in Chromium, and Electron's
 * session API (`clearStorageData` / `clearData` / `clearCache`) exposes no "since" parameter at any
 * version — Chromium has one internally and does not surface it. So those two are all-or-nothing.
 *
 * Said out loud in the UI rather than hidden, because the alternative is a dialog that appears to
 * remove the last hour of cookies and silently removes every cookie the user had. A control whose real
 * scope is wider than its label is worse than a control that is honest about being blunt.
 */
export const TIME_RANGEABLE_CATEGORIES: readonly BrowsingDataCategory[] = [
  'history',
  'downloads',
  'agentHistory',
];

export function isTimeRangeable(category: BrowsingDataCategory): boolean {
  return TIME_RANGEABLE_CATEGORIES.includes(category);
}

export const BrowsingDataClearRequestSchema = z.object({
  range: BrowsingDataRangeSchema,
  /** At least one — a clear that clears nothing is a bug, not a no-op worth serving. */
  categories: z.array(BrowsingDataCategorySchema).min(1).max(BROWSING_DATA_CATEGORIES.length),
});
export type BrowsingDataClearRequest = z.infer<typeof BrowsingDataClearRequestSchema>;

/**
 * What the clear actually did. Counts, not a boolean: "cleared" with nothing behind it is exactly the
 * reassurance this dialog must not give, and the numbers are what let the UI say `142 history entries`
 * rather than `Done`.
 */
export interface BrowsingDataClearResult {
  range: BrowsingDataRange;
  historyEntries: number;
  downloadEntries: number;
  agentConversations: number;
  /** Browsing partitions whose cookies/site storage were cleared (0 when the category was not asked for). */
  cookiePartitions: number;
  cachePartitions: number;
  /** Categories that were asked for and could not be honoured, so the UI never reports a silent skip. */
  failed: BrowsingDataCategory[];
}

/**
 * The cutoff timestamp for a range, or `null` for "all time".
 *
 * Pure and exported so the boundary between "which rows" and "how they are deleted" is testable
 * without a database. Ranges are wall-clock durations back from `now`, which is what every browser
 * means by them — not calendar boundaries.
 */
export function browsingDataCutoff(range: BrowsingDataRange, now: number): number | null {
  const hour = 3_600_000;
  switch (range) {
    case 'last-hour':
      return now - hour;
    case 'last-day':
      return now - 24 * hour;
    case 'last-week':
      return now - 7 * 24 * hour;
    case 'last-4-weeks':
      return now - 28 * 24 * hour;
    case 'all-time':
      return null;
  }
}
