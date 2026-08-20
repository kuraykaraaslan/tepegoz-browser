/**
 * Deterministic, rule-based fill STRATEGY for a widget-driven field (S3 PR7): given the value the model
 * asked to fill and the widget's now-open popup, find the one option/day to actually CLICK — never a
 * model call inside an action, and never a value set without a real click (the datepicker fixture this
 * exists for rejects exactly that: a value written without the matching click stays un-booked).
 *
 * Deliberately DOM-free — it walks a duck-typed shape any real `Element`/`Document` satisfies, so the
 * driver can inject the *same* algorithm into the page via `findWidgetOption.toString()`: what is
 * unit-tested here is exactly what runs (mirrors `dom-path.ts`'s `resolveNodePath`/`findByLocators`).
 */

/** The minimal shape one candidate option/day needs — satisfied by a real DOM `Element`. */
export interface WidgetOptionNode {
  readonly textContent: string | null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  readonly offsetParent: unknown;
}

/** The minimal shape the search root needs — satisfied by a real DOM `Document`/`Element`. */
export interface WidgetOptionRoot {
  querySelectorAll(selector: string): ArrayLike<WidgetOptionNode>;
}

/** A found option: the on-screen point to click it at, and its label (for the caller's own reporting). */
export interface WidgetOptionMatch {
  x: number;
  y: number;
  label: string;
}

/**
 * Find the option/day inside a widget's popup whose visible text matches `matchText`, restricted to
 * `[role="option"]` / `[role="button"]` candidates — the same accessible shape an ARIA combobox's
 * listbox or a calendar's day cells already expose, so a stray match elsewhere on the page can never be
 * picked. Only elements with a real on-screen box AND an `offsetParent` are considered, so a popup that
 * has not rendered yet (or one the page hid again) yields no match rather than a hidden one.
 *
 * Matching cascade, most to least precise:
 *  1. exact visible text (case-insensitive) — a combobox option like "France".
 *  2. diacritic-insensitive text (mirrors the native-`<select>` fill path's own NFKD normalize).
 *  3. the DAY OF MONTH, when `matchText` parses as a date — a calendar cell almost never repeats the
 *     whole date, only the bare day number. Both the local- and UTC-parsed day are accepted: a date-only
 *     ISO string parses as UTC midnight while other formats parse as local midnight, and accepting
 *     either avoids a timezone-dependent off-by-one instead of guessing which one the runtime meant.
 *  4. substring (last resort, broadest).
 *
 * Returns `null` on no match — the caller falls back to refusing the fill, never to a guess.
 */
export function findWidgetOption(
  root: WidgetOptionRoot,
  matchText: string,
): WidgetOptionMatch | null {
  const want = String(matchText).trim();
  const wantLower = want.toLowerCase();
  const normalize = (s: string | null | undefined): string =>
    String(s ?? '')
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  const wantNormalized = normalize(want);

  const days: string[] = [];
  const parsed = new Date(want);
  if (!Number.isNaN(parsed.getTime())) {
    days.push(String(parsed.getDate()));
    const utcDay = String(parsed.getUTCDate());
    if (!days.includes(utcDay)) days.push(utcDay);
  }

  const candidates = Array.from(root.querySelectorAll('[role="option"],[role="button"]'));
  const visible = candidates.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  });
  const textOf = (el: WidgetOptionNode): string => String(el.textContent ?? '').trim();

  const found =
    visible.find((el) => textOf(el).toLowerCase() === wantLower) ??
    visible.find((el) => normalize(textOf(el)) === wantNormalized) ??
    (days.length > 0 ? visible.find((el) => days.includes(textOf(el))) : undefined) ??
    (wantNormalized.length > 0
      ? visible.find((el) => normalize(textOf(el)).includes(wantNormalized))
      : undefined);
  if (found === undefined) return null;
  const r = found.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: textOf(found).slice(0, 80) };
}
