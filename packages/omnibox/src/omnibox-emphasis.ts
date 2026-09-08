/**
 * Matched-substring emphasis for omnibox suggestion rows — the "bold the part you typed" affordance
 * every mainstream browser has (competitive-parity track, Tier 0 item 3).
 *
 * The match is found the SAME way suggestions are filtered: through `@tepegoz/i18n`'s `foldForSearch`
 * (Turkish-correct dotted/dotless `i` folding, accent-insensitive), so `sisli` emphasises `Şişli`
 * exactly as it is already surfaced. Folding is NOT length-preserving (`İ` lower-cases to `i` + a
 * combining dot before the mark is stripped; `Ş` decomposes through `s` + a combining cedilla), so the
 * fold is done **per original code point** and every fold-space position carries the UTF-16 offset of
 * the code point it came from — the match is located in fold-space and mapped straight back to
 * original-string indices.
 *
 * Pure and presentational: no React, no strings. The row component turns {@link emphasisSegments} into
 * plain `<span>` text nodes — never raw HTML.
 */

import { foldForSearch } from '@tepegoz/i18n';

/** A half-open `[start, end)` span of the ORIGINAL string (UTF-16 offsets) that matched the query. */
export interface EmphasisRange {
  start: number;
  end: number;
}

/** One run of the original text, flagged matched (emphasise) or not. Concatenates back to `text`. */
export interface EmphasisSegment {
  text: string;
  match: boolean;
}

/**
 * The case-insensitive / accent-folded spans of `query` within `text`, as ranges over the ORIGINAL
 * string. Overlapping and repeated occurrences are merged into maximal runs. Returns `[]` for an empty
 * query, empty text, a query longer than the folded text, or simply no match.
 */
export function emphasisRanges(text: string, query: string): EmphasisRange[] {
  const needle = foldForSearch(query);
  if (text.length === 0 || needle.length === 0) return [];

  // Walk the original by code point. `codePoints[i]` is 1–2 UTF-16 units; `origin[i]` is its offset in
  // `text`, and `origin[codePoints.length]` is `text.length` (the exclusive end of the last one).
  const codePoints = Array.from(text);
  const origin: number[] = [];
  const folded: string[] = [];
  let offset = 0;
  for (const cp of codePoints) {
    origin.push(offset);
    folded.push(foldForSearch(cp));
    offset += cp.length;
  }
  origin.push(offset);

  // Prefix offsets of each code point's fold within the concatenated fold-space string.
  const foldStart: number[] = [];
  let acc = 0;
  for (const f of folded) {
    foldStart.push(acc);
    acc += f.length;
  }
  foldStart.push(acc);

  const haystack = folded.join('');
  if (needle.length > haystack.length) return [];

  // Every fold-space match interval — step by one so overlapping occurrences are all found.
  const intervals: Array<readonly [number, number]> = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    intervals.push([at, at + needle.length]);
  }
  if (intervals.length === 0) return [];

  // A code point is matched when its (non-empty) fold-space span overlaps any match interval.
  const matched = new Array<boolean>(codePoints.length).fill(false);
  for (const [lo, hi] of intervals) {
    for (let i = 0; i < codePoints.length; i++) {
      const a = foldStart[i]!;
      const b = foldStart[i + 1]!;
      if (b > a && a < hi && b > lo) matched[i] = true;
    }
  }
  // Pull a trailing zero-width code point (a lone combining mark) into the run before it, so the
  // emphasised slice stays a well-formed substring rather than splitting a grapheme.
  for (let i = 1; i < codePoints.length; i++) {
    if (matched[i] !== true && matched[i - 1] === true && foldStart[i]! === foldStart[i + 1]!) {
      matched[i] = true;
    }
  }

  const ranges: EmphasisRange[] = [];
  for (let i = 0; i < codePoints.length;) {
    if (matched[i] !== true) {
      i += 1;
      continue;
    }
    const start = origin[i]!;
    let end = i;
    while (end < codePoints.length && matched[end] === true) end += 1;
    ranges.push({ start, end: origin[end]! });
    i = end;
  }
  return ranges;
}

/**
 * `text` split into consecutive {@link EmphasisSegment}s — matched runs interleaved with the gaps
 * between them. Always concatenates back to `text`; empty `text` gives `[]`, and text with no match
 * gives a single unmatched segment.
 */
export function emphasisSegments(text: string, query: string): EmphasisSegment[] {
  if (text.length === 0) return [];
  const ranges = emphasisRanges(text, query);
  if (ranges.length === 0) return [{ text, match: false }];

  const segments: EmphasisSegment[] = [];
  let pos = 0;
  for (const { start, end } of ranges) {
    if (start > pos) segments.push({ text: text.slice(pos, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), match: false });
  return segments;
}
