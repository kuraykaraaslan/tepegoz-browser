import { describe, expect, it } from 'vitest';
import { conversationListTime, daySeparatorLabel, groupByDay, isSameDay, startOfDay } from './time';

const WORDS = { today: 'Today', yesterday: 'Yesterday' };

// A fixed reference instant: 2026-03-15T09:30:00 local.
const NOON = new Date(2026, 2, 15, 9, 30, 0).getTime();
const DAY = 86_400_000;

describe('startOfDay / isSameDay', () => {
  it('collapses any instant to its local midnight', () => {
    expect(startOfDay(NOON)).toBe(new Date(2026, 2, 15, 0, 0, 0, 0).getTime());
  });

  it('isSameDay is true within a day, false across the boundary', () => {
    expect(isSameDay(NOON, NOON + 3 * 3600_000)).toBe(true);
    expect(isSameDay(NOON, NOON + DAY)).toBe(false);
  });
});

describe('groupByDay', () => {
  it('opens a new group each time the calendar day changes', () => {
    const msgs = [
      { id: 'a', ts: NOON },
      { id: 'b', ts: NOON + 3600_000 },
      { id: 'c', ts: NOON + DAY },
      { id: 'd', ts: NOON + 2 * DAY },
      { id: 'e', ts: NOON + 2 * DAY + 60_000 },
    ];
    const groups = groupByDay(msgs, (m) => m.ts);
    expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
    expect(groups[0]?.day).toBe(startOfDay(NOON));
  });

  it('returns [] for no messages', () => {
    expect(groupByDay([], () => 0)).toEqual([]);
  });
});

describe('daySeparatorLabel', () => {
  it('names today and yesterday', () => {
    expect(daySeparatorLabel(startOfDay(NOON), NOON, WORDS)).toBe('Today');
    expect(daySeparatorLabel(startOfDay(NOON - DAY), NOON, WORDS)).toBe('Yesterday');
  });

  it('formats an older day, adding the year only when it differs', () => {
    const thisYear = daySeparatorLabel(startOfDay(new Date(2026, 0, 4).getTime()), NOON, WORDS, 'en-US');
    expect(thisYear).toBe('January 4');
    const lastYear = daySeparatorLabel(startOfDay(new Date(2025, 11, 20).getTime()), NOON, WORDS, 'en-US');
    expect(lastYear).toBe('December 20, 2025');
  });
});

describe('conversationListTime', () => {
  it('is a bare clock time for something that arrived today', () => {
    expect(conversationListTime(NOON, NOON, 'en-US')).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
  });

  it('falls back to a short date once it is a different day, adding the year only when it differs', () => {
    const thisYear = conversationListTime(new Date(2026, 0, 4).getTime(), NOON, 'en-US');
    expect(thisYear).toBe('Jan 4');
    const lastYear = conversationListTime(new Date(2025, 11, 20).getTime(), NOON, 'en-US');
    expect(lastYear).toBe('Dec 20, 2025');
  });
});
