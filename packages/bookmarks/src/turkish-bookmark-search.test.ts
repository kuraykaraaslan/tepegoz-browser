import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, MetaStore, type Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_BAR, BookmarkTreeStore } from './bookmark-tree-store';

/**
 * The "Turkish first-class" claim, checked where it was still false.
 *
 * The bookmarks MANAGER was fixed at the surface — it filters the loaded tree in the renderer with
 * `foldForSearch` — and that is exactly what hid this: the visible search worked, so the store
 * underneath it was never suspected. `BookmarkTreeStore.search` was still `url LIKE ? OR title LIKE ?`,
 * and SQLite's LIKE folds ASCII only, so every one of these queries came back empty. Empty, not an
 * error, which a user reads as "you have no such bookmark".
 *
 * The same bug had already been found and fixed for history (migration 16). Fixing one instance of a
 * class and leaving the other is how a defect comes back; this is the other one.
 */
let db: Db;

function bookmark(title: string, url: string): string {
  return BookmarkTreeStore.createBookmark(db, { parentId: BOOKMARK_ROOT_BAR, title, url });
}
function found(query: string): string[] {
  return BookmarkTreeStore.search(db, query).map((b) => b.title);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('bookmark search folds Turkish the way the rest of the product does', () => {
  it('finds a dotted capital İ by typing a plain i', () => {
    // 'İSTANBUL'.toLowerCase() is 'i' + COMBINING DOT ABOVE, so the naive path missed silently.
    bookmark('İSTANBUL Gezisi', 'https://a.example/');
    expect(found('istanbul')).toEqual(['İSTANBUL Gezisi']);
  });

  it('finds a dotless ı by typing the capital I spelling, and the reverse', () => {
    // The mirror case is worse because it looks like it works: 'ISPARTA'.toLowerCase() gives a DOTTED
    // i, which a Turkish user typing `ısparta` never matches.
    bookmark('ISPARTA notları', 'https://b.example/');
    expect(found('ısparta')).toEqual(['ISPARTA notları']);
    expect(found('NOTLARI')).toEqual(['ISPARTA notları']);
  });

  it('is accent-insensitive, because nobody reaches for ş mid-search', () => {
    bookmark('Şişli kahvaltı', 'https://c.example/');
    expect(found('sisli')).toEqual(['Şişli kahvaltı']);
    expect(found('şişli')).toEqual(['Şişli kahvaltı']);
  });

  it('folds the URL too, not only the title', () => {
    bookmark('Bir sayfa', 'https://GÜNCEL.example/İÇERİK');
    expect(found('guncel')).toEqual(['Bir sayfa']);
    expect(found('icerik')).toEqual(['Bir sayfa']);
  });

  it('folds tags for SEARCH while leaving tag identity alone', () => {
    const id = bookmark('Rapor', 'https://d.example/');
    BookmarkTreeStore.setTags(db, id, ['İŞ', 'is']);
    // Identity is unchanged: `tag_key` does not strip accents, so "İŞ" and "is" stay two tags — a
    // bookmark tagged both is tagged both. Only SEARCH collapses them, which is what a searcher wants.
    expect(BookmarkTreeStore.tagsOf(db, id)).toHaveLength(2);
    expect(found('is')).toEqual(['Rapor']);
    expect(found('İŞ')).toEqual(['Rapor']);
  });

  it('re-folds when a bookmark is renamed or re-pointed', () => {
    const id = bookmark('Placeholder', 'https://e.example/');
    BookmarkTreeStore.rename(db, id, 'Işık ve gölge');
    expect(found('isik')).toEqual(['Işık ve gölge']);

    BookmarkTreeStore.setUrl(db, id, 'https://ışık.example/');
    expect(found('isik.example')).toEqual(['Işık ve gölge']);
  });

  it('still treats a bare wildcard as text, not as "match everything"', () => {
    // The fold runs before `likeContains` escapes; it can only remove combining marks, never add a
    // wildcard, and this is what pins that.
    bookmark('Half price 50% off', 'https://f.example/');
    bookmark('Şişli kahvaltı', 'https://g.example/');
    expect(found('%')).toEqual(['Half price 50% off']);
    expect(found('_')).toEqual([]);
  });
});

describe('backfilling rows written before the fold columns existed', () => {
  it('re-folds every node and tag once, then never again', () => {
    const id = bookmark('İSTANBUL Gezisi', 'https://a.example/');
    BookmarkTreeStore.setTags(db, id, ['Şehir']);
    // Simulate the pre-migration-17 state: the rows exist, the shadow columns are empty.
    db.exec(`UPDATE bookmark_nodes SET title_fold = '', url_fold = ''`);
    db.exec(`UPDATE bookmark_tags SET tag_fold = ''`);
    MetaStore.set(db, 'bookmark_fold_version', '');
    expect(found('istanbul')).toEqual([]);

    expect(BookmarkTreeStore.reindexFoldsIfStale(db)).toBeGreaterThan(0);
    expect(found('istanbul')).toEqual(['İSTANBUL Gezisi']);
    expect(found('sehir')).toEqual(['İSTANBUL Gezisi']);
    // Idempotent: a matching marker makes the next startup a no-op rather than a full table rewrite.
    expect(BookmarkTreeStore.reindexFoldsIfStale(db)).toBe(0);
  });

  it('costs one pass over the two roots on a database nobody has used yet', () => {
    // A fresh profile holds exactly the two fixed roots, so the first startup after migration 17
    // rewrites two rows and marks the version. Everything after that is free.
    expect(BookmarkTreeStore.reindexFoldsIfStale(db)).toBe(2);
    expect(BookmarkTreeStore.reindexFoldsIfStale(db)).toBe(0);
  });
});
