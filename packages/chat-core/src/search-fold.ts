import { foldForSearch } from '@tepegoz/i18n';

/**
 * History search folding for chat, on the ONE definition (`@tepegoz/i18n`'s `foldForSearch` — the
 * omnibox's rule: collapses the dotted/dotless `i` family and strips accents). Never SQLite `LOWER()`
 * (persistence migrations v16–v18 record why: it is ASCII-only and silently breaks Turkish search).
 */
export { foldForSearch };

const MAX_TOKENS = 64;

/** Tokenize a message body for the FTS writer / a query: fold, split on non-alphanumerics, drop
 *  empties and duplicates, cap the count so an enormous message cannot bloat the index row. */
export function tokenize(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of foldForSearch(input).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length === 0) continue;
    seen.add(raw);
    if (seen.size >= MAX_TOKENS) break;
  }
  return [...seen];
}

/** Case/accent-insensitive substring test used by the local (non-FTS) filter path. */
export function foldedIncludes(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return foldForSearch(haystack).includes(foldForSearch(needle));
}
