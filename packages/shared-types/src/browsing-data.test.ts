import { describe, expect, it } from 'vitest';
import {
  BROWSING_DATA_CATEGORIES,
  BrowsingDataClearRequestSchema,
  browsingDataCutoff,
  isTimeRangeable,
} from './browsing-data';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('browsingDataCutoff', () => {
  it('measures back from now, not from a calendar boundary', () => {
    // "Last 24 hours" means the last 24 hours, not "since midnight". Every browser means the former,
    // and a user who clears at 00:30 expecting yesterday evening gone would otherwise keep it.
    expect(browsingDataCutoff('last-hour', NOW)).toBe(NOW - HOUR);
    expect(browsingDataCutoff('last-day', NOW)).toBe(NOW - 24 * HOUR);
    expect(browsingDataCutoff('last-week', NOW)).toBe(NOW - 7 * 24 * HOUR);
    expect(browsingDataCutoff('last-4-weeks', NOW)).toBe(NOW - 28 * 24 * HOUR);
  });

  it('has no cutoff for all time, rather than a very old one', () => {
    // null, not 0. A sentinel timestamp is a bug waiting for a row with a clock-skewed date; null
    // makes the executor choose a different statement instead of a wider `WHERE`.
    expect(browsingDataCutoff('all-time', NOW)).toBeNull();
  });
});

describe('which categories a time range can reach', () => {
  it('is a property of the engine, and is stated for every category', () => {
    // Cookies and the cache live in Chromium, and Electron's session API exposes no "since" parameter
    // at any version — so the dialog must say those two are all-or-nothing rather than let the range
    // appear to cover them.
    expect(BROWSING_DATA_CATEGORIES.filter(isTimeRangeable)).toEqual([
      'history',
      'downloads',
      'agentHistory',
    ]);
    expect(BROWSING_DATA_CATEGORIES.filter((c) => !isTimeRangeable(c))).toEqual([
      'cookies',
      'cache',
    ]);
  });

  it('does not offer to clear saved passwords', () => {
    // A considered deviation from Chrome, matching the per-site clear: deleting a credential is a
    // different act from clearing a trace and has to be asked for where it can be confirmed on its
    // own terms. Pinned so it stays a decision rather than becoming an oversight someone "fixes".
    expect(BROWSING_DATA_CATEGORIES).not.toContain('passwords');
  });
});

describe('the request boundary', () => {
  it('refuses a clear that would clear nothing', () => {
    expect(
      BrowsingDataClearRequestSchema.safeParse({ range: 'last-hour', categories: [] }).success,
    ).toBe(false);
  });

  it('refuses a category it does not know', () => {
    expect(
      BrowsingDataClearRequestSchema.safeParse({ range: 'last-hour', categories: ['passwords'] })
        .success,
    ).toBe(false);
  });

  it('refuses a range it does not know', () => {
    expect(
      BrowsingDataClearRequestSchema.safeParse({ range: 'since-forever', categories: ['history'] })
        .success,
    ).toBe(false);
  });

  it('accepts the shape the dialog sends', () => {
    const parsed = BrowsingDataClearRequestSchema.safeParse({
      range: 'last-4-weeks',
      categories: ['history', 'cookies', 'cache'],
    });
    expect(parsed.success).toBe(true);
  });
});
