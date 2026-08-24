import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_OTHER, BookmarkTreeStore } from './bookmark-tree-store';
import {
  MAX_TAG_CHARS,
  MAX_TAGS_PER_BOOKMARK,
  normalizeTags,
  parseTagInput,
} from './bookmark-tags';

describe('tag normalization', () => {
  it('keeps the spelling the user typed', () => {
    expect(normalizeTags(['Machine Learning'])).toEqual([
      { tag: 'Machine Learning', key: 'machine learning' },
    ]);
  });

  it('treats case-variants as ONE tag, keeping the first spelling', () => {
    // Last-wins would silently re-case every existing use of a tag whenever it is re-added.
    expect(normalizeTags(['Work', 'work', 'WORK'])).toEqual([{ tag: 'Work', key: 'work' }]);
  });

  it('unifies a combining accent with its precomposed form', () => {
    // They are the same glyph on screen; it would be indefensible for them to be two tags.
    const [a] = normalizeTags(['café']);
    const [b] = normalizeTags(['café']);
    expect(a?.key).toBe(b?.key);
  });

  it('collapses whitespace and drops empties', () => {
    expect(normalizeTags(['  a   b  ', '', '   '])).toEqual([{ tag: 'a b', key: 'a b' }]);
  });

  it('caps the tag length and the tag count', () => {
    const [long] = normalizeTags(['x'.repeat(500)]);
    expect(long?.tag).toHaveLength(MAX_TAG_CHARS);
    const many = normalizeTags(Array.from({ length: 100 }, (_, i) => `t${String(i)}`));
    expect(many).toHaveLength(MAX_TAGS_PER_BOOKMARK);
  });

  /**
   * The measured limit, pinned so it stays a decision rather than an accident. `toLowerCase()` is
   * locale-independent, and Turkish dotted/dotless I is where that differs from a Turkish reader's
   * expectation. The alternative — folding by UI locale — is worse: the same tag would fold
   * differently depending on the interface language, so switching to English would fork the user's
   * own tags.
   */
  it('does NOT unify the Turkish dotted and dotless I, by choice', () => {
    const [upper] = normalizeTags(['IŞIK']);
    const [lower] = normalizeTags(['ışık']);
    expect(upper?.key).toBe('işik');
    expect(lower?.key).toBe('ışık');
    expect(upper?.key).not.toBe(lower?.key);
  });

  it('folds every other Turkish letter as expected', () => {
    // The exception above is the dotted/dotless I alone — ş, ğ, ü, ö, ç must still fold.
    expect(normalizeTags(['ÖĞÜŞÇ'])[0]?.key).toBe('öğüşç');
  });
});

describe('parseTagInput', () => {
  it('splits on commas, NOT on spaces', () => {
    // "machine learning" is one tag. A browser that quietly made it two would be wrong about exactly
    // the thing its user most wanted to write.
    expect(parseTagInput('machine learning, ai , ')).toEqual([
      { tag: 'machine learning', key: 'machine learning' },
      { tag: 'ai', key: 'ai' },
    ]);
  });
});

describe('tags in the store', () => {
  let db: Db;
  let id: string;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    id = BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_OTHER,
      title: 'Paper',
      url: 'https://example.com/paper',
    });
  });

  it('stores and reads back a bookmark’s tags', () => {
    expect(BookmarkTreeStore.setTags(db, id, ['Research', 'ai'])).toEqual(['Research', 'ai']);
    expect(BookmarkTreeStore.tagsOf(db, id)).toEqual(['ai', 'Research']); // ordered by fold
  });

  it('REPLACES rather than merges, so a mistyped tag can be removed', () => {
    BookmarkTreeStore.setTags(db, id, ['typpo', 'ai']);
    BookmarkTreeStore.setTags(db, id, ['ai']);
    expect(BookmarkTreeStore.tagsOf(db, id)).toEqual(['ai']);
  });

  it('refuses to tag a FOLDER — two grouping mechanisms on one node is not explainable', () => {
    const folder = BookmarkTreeStore.createFolder(db, {
      parentId: BOOKMARK_ROOT_OTHER,
      title: 'Reading',
    });
    expect(BookmarkTreeStore.setTags(db, folder, ['x'])).toEqual([]);
    expect(BookmarkTreeStore.tagsOf(db, folder)).toEqual([]);
  });

  it('finds a bookmark by tag, ignoring the case the caller used', () => {
    BookmarkTreeStore.setTags(db, id, ['Research']);
    expect(BookmarkTreeStore.searchByTag(db, 'RESEARCH').map((b) => b.url)).toEqual([
      'https://example.com/paper',
    ]);
  });

  it('includes tags in the ordinary search, so tagging actually pays off', () => {
    BookmarkTreeStore.setTags(db, id, ['Research']);
    // Neither the title ("Paper") nor the url contains "research".
    expect(BookmarkTreeStore.search(db, 'research').map((b) => b.url)).toEqual([
      'https://example.com/paper',
    ]);
  });

  it('returns a bookmark ONCE even when several of its tags match', () => {
    BookmarkTreeStore.setTags(db, id, ['research', 'research-notes', 'researcher']);
    expect(BookmarkTreeStore.search(db, 'research')).toHaveLength(1);
  });

  it('lists tags with counts for the sidebar', () => {
    const other = BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_OTHER,
      title: 'Other',
      url: 'https://example.com/other',
    });
    BookmarkTreeStore.setTags(db, id, ['ai', 'papers']);
    BookmarkTreeStore.setTags(db, other, ['AI']);
    // One entry for ai/AI, not two — the list's whole job is to be the canonical set.
    expect(BookmarkTreeStore.listTags(db)).toEqual([
      { tag: 'AI', count: 2 },
      { tag: 'papers', count: 1 },
    ]);
  });

  it('drops a deleted bookmark’s tags rather than counting them forever', () => {
    BookmarkTreeStore.setTags(db, id, ['ai']);
    BookmarkTreeStore.remove(db, id);
    expect(BookmarkTreeStore.listTags(db)).toEqual([]);
  });

  it('is additive: bookmarks that existed before tags keep working untagged', () => {
    expect(BookmarkTreeStore.tagsOf(db, id)).toEqual([]);
    expect(BookmarkTreeStore.search(db, 'Paper').map((b) => b.url)).toEqual([
      'https://example.com/paper',
    ]);
  });
});
