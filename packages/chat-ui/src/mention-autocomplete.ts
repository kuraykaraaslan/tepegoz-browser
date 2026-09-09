import { foldForSearch } from '@tepegoz/i18n';

/**
 * `@nick` autocomplete for the composer in a room. Pure: find the in-progress mention token under the
 * caret, rank the room's nicks against it (fold-aware, exact-prefix first), and splice a chosen nick
 * back into the draft.
 */

export interface MentionQuery {
  /** The text between `@` and the caret (may be empty right after `@`). */
  prefix: string;
  /** Index of the `@`. */
  start: number;
  /** The caret index (end of the token). */
  end: number;
}

const BOUNDARY = /[\s(]/;

/** The mention token the caret is inside, or `null` when the caret is not in one. */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 1 || caret > text.length) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i] ?? '';
    if (ch === '@') {
      const before = i > 0 ? text[i - 1] ?? '' : '';
      if (i === 0 || BOUNDARY.test(before)) {
        return { prefix: text.slice(i + 1, caret), start: i, end: caret };
      }
      return null;
    }
    if (BOUNDARY.test(ch) || ch === '@') return null;
    i -= 1;
  }
  return null;
}

/** Nicks matching `prefix`: exact fold-prefix matches first, then fold-substring, both nick-sorted. */
export function rankMentionCandidates(
  nicks: readonly string[],
  prefix: string,
  limit = 8,
): string[] {
  const needle = foldForSearch(prefix);
  if (needle === '') return [...nicks].sort((a, b) => a.localeCompare(b)).slice(0, limit);

  const prefixed: string[] = [];
  const contained: string[] = [];
  for (const nick of nicks) {
    const folded = foldForSearch(nick);
    if (folded.startsWith(needle)) prefixed.push(nick);
    else if (folded.includes(needle)) contained.push(nick);
  }
  const bySort = (a: string, b: string): number => a.localeCompare(b);
  return [...prefixed.sort(bySort), ...contained.sort(bySort)].slice(0, limit);
}

/** Replace the mention token with `@nick ` and return the new text + caret position. */
export function applyMention(
  text: string,
  query: MentionQuery,
  nick: string,
): { text: string; caret: number } {
  const insert = `@${nick} `;
  const next = text.slice(0, query.start) + insert + text.slice(query.end);
  return { text: next, caret: query.start + insert.length };
}
