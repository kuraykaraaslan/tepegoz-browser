/**
 * Turkish text + IME/keyboard skeleton (Phase 0 i18n infra). Two concerns:
 *
 * 1. **Case folding** — JavaScript's default `toUpperCase()/toLowerCase()` are WRONG for Turkish: they
 *    map `i→I` and `I→i`, but Turkish has dotted/dotless pairs (`i↔İ`, `ı↔I`). Any case transform on
 *    user text (search, matching, display) must be locale-correct. These helpers use the engine's
 *    `toLocale*Case('tr')` and are unit-tested against the four special mappings.
 *
 * 2. **IME/keyboard regression matrix** — Turkish TEXT input is independent of the UI language: it must
 *    work on Turkish-Q and Turkish-F layouts, including the diacritic characters and dead keys. Actual
 *    keystroke simulation is a Playwright/manual pass (Phase 1a); this module ships the *matrix data*
 *    the regression suite iterates, so the Phase-1a work is "fill the runner", not "design the cases".
 */

/** The six Turkish-specific letters (lower/upper), the ones plain ASCII case folding gets wrong. */
export const TURKISH_SPECIAL_LETTERS: ReadonlyArray<{ lower: string; upper: string }> = [
  { lower: 'ç', upper: 'Ç' },
  { lower: 'ğ', upper: 'Ğ' },
  { lower: 'ı', upper: 'I' }, // dotless i ↔ dotless I
  { lower: 'i', upper: 'İ' }, // dotted i ↔ dotted İ
  { lower: 'ö', upper: 'Ö' },
  { lower: 'ş', upper: 'Ş' },
  { lower: 'ü', upper: 'Ü' },
];

/** Turkish-locale upper-casing (`i→İ`, `ı→I`) — never the ASCII default. */
export function turkishUpper(input: string): string {
  return input.toLocaleUpperCase('tr-TR');
}

/** Turkish-locale lower-casing (`I→ı`, `İ→i`) — never the ASCII default. */
export function turkishLower(input: string): string {
  return input.toLocaleLowerCase('tr-TR');
}

/**
 * Case-fold a string for SUBSTRING SEARCH over user text — correctly for Turkish AND English.
 *
 * Plain `toLowerCase()` breaks Turkish search, and it breaks it silently:
 *
 *     'İSTANBUL'.toLowerCase()  ->  'i̇stanbul'   (i + U+0307 COMBINING DOT ABOVE)
 *
 * so a bookmark titled "İSTANBUL Gezisi" is NOT found by typing `istanbul`. The mirror case is worse
 * because it looks like it works: `'ISPARTA'.toLowerCase()` gives `'isparta'` with a DOTTED i, which a
 * Turkish user searching `ısparta` will never match.
 *
 * `turkishLower` is not the fix either — it is locale-correct and therefore wrong here:
 * `'ITEM'.toLocaleLowerCase('tr')` is `'ıtem'`, so switching search to it would break English while
 * fixing Turkish. Search must satisfy both at once, because the UI language and the language of the
 * user's own bookmarks are independent.
 *
 * The behaviour here is not newly invented: it is the omnibox's, lifted out of
 * `omnibox-suggest.ts` where it had been correct and private while four other search surfaces
 * (bookmarks, extensions, credentials, settings) used the naive `toLowerCase()` and were broken. One
 * definition matters more than which definition — a query that behaves differently in the address bar
 * and in the bookmarks manager is worse than either rule applied consistently.
 *
 * Fold the dotless `ı` into `i`, lowercase, then decompose and drop combining marks. That collapses all
 * four members of the i family AND makes search accent-insensitive (`sisli` finds `Şişli`), which is
 * what someone hunting for a page wants: nobody reliably types `ı` vs `i`, or reaches for `ş`, mid-search.
 */
export function foldForSearch(input: string): string {
  return input.replaceAll('ı', 'i').toLocaleLowerCase('en-US').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Turkish-collation comparison (ç, ğ, ı, ö, ş, ü sort in their correct places). */
export function turkishCompare(a: string, b: string): number {
  return a.localeCompare(b, 'tr-TR');
}

/** Keyboard layouts that must input Turkish text (independent of the UI language). */
export const TURKISH_LAYOUTS = ['tr-Q', 'tr-F'] as const;
export type TurkishLayout = (typeof TURKISH_LAYOUTS)[number];

/**
 * One IME regression case: the character (or sequence) a layout must produce, and whether it involves a
 * dead key (e.g. circumflex on â). The Phase-1a runner types `sequence` on `layout` and asserts the
 * focused input receives `expected`, across the app's text surfaces (omnibox, command palette, forms).
 */
export interface ImeCase {
  layout: TurkishLayout;
  /** Human label for the regression report. */
  name: string;
  /** Keystroke description (layout-relative); the runner maps it to synthesized key events. */
  sequence: string;
  /** The exact string the input should contain afterwards. */
  expected: string;
  /** Whether this case exercises a dead-key (accent) composition. */
  deadKey: boolean;
}

/** The Phase-0 skeleton matrix (extended/executed by the Phase-1a Playwright IME suite). */
export const IME_MATRIX: readonly ImeCase[] = [
  ...TURKISH_LAYOUTS.flatMap((layout): ImeCase[] =>
    TURKISH_SPECIAL_LETTERS.map((l) => ({
      layout,
      name: `${layout}: ${l.lower}/${l.upper}`,
      sequence: l.lower,
      expected: l.lower,
      deadKey: false,
    })),
  ),
  {
    layout: 'tr-Q',
    name: 'tr-Q: dead-key circumflex â',
    sequence: 'deadCircumflex+a',
    expected: 'â',
    deadKey: true,
  },
  {
    layout: 'tr-F',
    name: 'tr-F: dead-key circumflex î',
    sequence: 'deadCircumflex+i',
    expected: 'î',
    deadKey: true,
  },
];
