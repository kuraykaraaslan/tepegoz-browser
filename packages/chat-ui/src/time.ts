/**
 * Day-bucketing for the message timeline. All pure — the host passes `Date.now()` and a locale so
 * these stay deterministic under test and localised in the app.
 */

const DAY_MS = 86_400_000;

/** Local-midnight timestamp for the day `ts` falls in. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export interface DayGroup<M> {
  /** Local-midnight timestamp — the separator key. */
  readonly day: number;
  readonly items: readonly M[];
}

/**
 * Bucket an already-ordered message list into consecutive day groups. Input order is preserved; a
 * group boundary opens whenever the local calendar day changes.
 */
export function groupByDay<M>(items: readonly M[], tsOf: (item: M) => number): DayGroup<M>[] {
  const groups: DayGroup<M>[] = [];
  let current: { day: number; items: M[] } | null = null;
  for (const item of items) {
    const day = startOfDay(tsOf(item));
    if (current === null || current.day !== day) {
      current = { day, items: [item] };
      groups.push(current);
    } else {
      current.items.push(item);
    }
  }
  return groups;
}

/**
 * The label a day separator shows: "Today" / "Yesterday" for the two most recent days, otherwise a
 * locale-formatted date. `now` is injected so "today" is the *viewer's* today.
 */
export function daySeparatorLabel(
  day: number,
  now: number,
  words: { today: string; yesterday: string },
  locale?: string,
): string {
  const today = startOfDay(now);
  if (day === today) return words.today;
  if (day === today - DAY_MS) return words.yesterday;
  const includeYear = new Date(day).getFullYear() !== new Date(today).getFullYear();
  return new Date(day).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}
