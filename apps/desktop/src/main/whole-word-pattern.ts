import { AppError } from '@tepegoz/libs';

/**
 * `\b`-anchored whole-word matching — the additive replacement for Electron's dropped `wordStart` find
 * option (phase-2c, "Match whole word"). Pure and Electron-free on purpose: the regex SOURCE/FLAGS are
 * computed here, in Node, and handed as literals to `whole-word-find-script.ts`'s isolated-world
 * injection, so the escaping logic has exactly one implementation to audit instead of being re-derived
 * in page-context JS from a raw string.
 *
 * Known limitation, recorded rather than silently accepted: JS regex `\b` is defined over ASCII `\w`
 * ([A-Za-z0-9_]), not Unicode letters. A query or surrounding text using Turkish-specific letters at a
 * word edge (ı/ş/ğ/ü/ö/ç, upper or lower) can under- or over-match there, because `\b` sees a transition
 * to/from those letters as a word boundary when it should not. A correct Unicode-aware boundary needs
 * `\p{L}`-based custom boundary logic (the `u` flag alone does not fix `\b` itself); not attempted here.
 */

/** Mirrors `FindInPageQuerySchema`'s query cap (`packages/desktop-ipc/src/schemas-tabs.ts`). The IPC
 *  boundary already rejects anything longer before this ever runs; this is belt-and-suspenders for any
 *  direct caller (a unit test, or a future non-IPC caller) that bypasses that schema. An escaped-literal
 *  `\b...\b` pattern has no nested quantifiers to blow up on — length is the only real ReDoS lever left,
 *  which is why capping it is the whole guard. */
export const WHOLE_WORD_QUERY_MAX_LENGTH = 1024;

/** Escape every regex metacharacter in a literal string so it can be embedded in a larger pattern
 *  without any of it being interpreted as one. */
export function escapeRegExpLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regex SOURCE/FLAGS pair, kept apart rather than a `RegExp` instance — both halves cross the
 *  isolated-world injection boundary as JSON-safe strings. */
export interface WholeWordPattern {
  source: string;
  flags: string;
}

/**
 * Build the whole-word pattern for `query`. Throws `AppError` on an empty or over-length query; the
 * caller (`main/whole-word-find.ts`) treats that as "no matches" rather than surfacing it to the chrome
 * window, since the IPC boundary should already have rejected both before this runs.
 */
export function buildWholeWordPattern(query: string, matchCase: boolean): WholeWordPattern {
  if (query.length === 0) {
    throw new AppError('Whole-word query must not be empty', 400);
  }
  if (query.length > WHOLE_WORD_QUERY_MAX_LENGTH) {
    throw new AppError(
      `Whole-word query exceeds ${String(WHOLE_WORD_QUERY_MAX_LENGTH)} characters`,
      400,
    );
  }
  return {
    source: `\\b${escapeRegExpLiteral(query)}\\b`,
    // Case-insensitive by default, like the native path's own `matchCase` flag; `g` is required either
    // way — the script counts every match, not just the first.
    flags: matchCase ? 'g' : 'gi',
  };
}
