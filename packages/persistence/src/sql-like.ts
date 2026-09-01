/**
 * `LIKE` operand helpers. Node-free on purpose — this module is also reachable from the renderer via
 * `@tepegoz/bookmarks`, so it must not pull `node:sqlite` in (import it as
 * `@tepegoz/persistence/sql-like`, never off the package barrel).
 *
 * SQLite's `LIKE` treats `%` and `_` as wildcards. A raw user query of `_` or `%` therefore matches
 * every row — measured: the whole browsing history and the whole bookmark list came back (omnibox
 * track § A3). Parameterisation does not help; `LIKE` interprets the wildcards after binding. The fix
 * is to escape `%`, `_`, and the escape character itself, and to pair every use with an `ESCAPE`
 * clause naming the same character.
 */

/** The escape character to name in the SQL `ESCAPE` clause. In a JS string literal this is one byte. */
export const LIKE_ESCAPE = '\\';

/**
 * `ESCAPE` clause text to append after a `LIKE ?` — e.g.
 * `` `WHERE title LIKE ? ${LIKE_ESCAPE_CLAUSE}` ``. Kept as a constant so the SQL and
 * {@link escapeLikeLiteral} can never disagree on which character is the escape.
 */
export const LIKE_ESCAPE_CLAUSE = "ESCAPE '\\'";

/** Escape `%`, `_` and the escape character so `raw` matches literally inside a `LIKE` pattern. */
export function escapeLikeLiteral(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => LIKE_ESCAPE + ch);
}

/** A `LIKE` pattern matching any row that contains `raw` as a literal substring. */
export function likeContains(raw: string): string {
  return `%${escapeLikeLiteral(raw)}%`;
}
