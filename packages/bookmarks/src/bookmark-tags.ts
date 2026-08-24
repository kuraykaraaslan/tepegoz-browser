/**
 * Tag normalization for bookmarks — kept free of the database so the rules are testable on their own.
 *
 * A tag has two forms and both are stored. `tag` is what the user typed, and is what gets displayed;
 * `key` is the case-folded form, and is what uniqueness and lookup use. That is why "Work" and "work"
 * are one tag on a bookmark rather than two, while the label still reads the way its author wrote it —
 * the single most common complaint about tag systems that pick only one of the two.
 *
 * **A measured limit, stated rather than papered over.** Folding uses `toLowerCase()`, which is
 * locale-independent, and the Turkish dotted/dotless I is the one place that differs from what a
 * Turkish reader expects: `'IŞIK'.toLowerCase()` is `'işik'`, not `'ışık'`, so those two do NOT unify
 * into one tag. The alternative — `toLocaleLowerCase('tr')` — is worse, because then the same tag folds
 * differently depending on the UI language and a user switching to English would fork their own tags.
 * A locale-independent rule that is occasionally surprising beats a locale-dependent one that is
 * silently inconsistent. `bookmark-tags.test.ts` pins this so it stays a decision rather than an
 * accident.
 *
 * Unicode normalization to NFC comes first, so a tag typed with a combining accent and the same tag
 * typed precomposed are the same tag — they look identical on screen and it would be indefensible for
 * them not to be.
 */

/** Long enough for a real label, short enough that the tag list stays readable. */
export const MAX_TAG_CHARS = 64;
/** Past this a "tag" is a note. Bounded because tags are user input and this repo bounds user input. */
export const MAX_TAGS_PER_BOOKMARK = 32;

export interface NormalizedTag {
  /** What the user typed, trimmed and whitespace-collapsed. Displayed. */
  tag: string;
  /** Case-folded. Unique per bookmark, and what lookups match on. Never displayed. */
  key: string;
}

/** Fold one raw string, or null when nothing usable is left. */
export function normalizeTag(raw: string): NormalizedTag | null {
  const tag = raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_CHARS).trim();
  if (tag.length === 0) return null;
  return { tag, key: tag.toLowerCase() };
}

/**
 * Normalize a whole list: drops empties, collapses case-duplicates keeping the FIRST spelling, and
 * caps the count.
 *
 * First spelling wins rather than last, so re-adding a tag you already have cannot silently re-case
 * every existing use of it.
 */
export function normalizeTags(raw: readonly string[]): NormalizedTag[] {
  const out: NormalizedTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_TAGS_PER_BOOKMARK) break;
    const t = normalizeTag(item);
    if (t === null || seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
  }
  return out;
}

/**
 * Split a free-text tag input into tags. Commas separate; whitespace does not, because "machine
 * learning" is one tag and a browser that silently made it two would be wrong about the thing its
 * user most wanted to write.
 */
export function parseTagInput(input: string): NormalizedTag[] {
  return normalizeTags(input.split(','));
}
