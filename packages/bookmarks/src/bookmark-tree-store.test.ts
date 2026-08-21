import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, migrate, type Db, skipWithoutNativeSqlite } from '@tepegoz/persistence';
import { BookmarkTreeStore, BOOKMARK_ROOT_BAR, BOOKMARK_ROOT_OTHER } from './bookmark-tree-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const titles = (parentId: string): string[] =>
  BookmarkTreeStore.listChildren(db, parentId).map((n) => n.title);

describe.skipIf(skipWithoutNativeSqlite())('BookmarkTreeStore — roots + migration', () => {
  it('seeds exactly the two fixed roots', () => {
    const tree = BookmarkTreeStore.getTree(db);
    expect(tree.map((n) => n.id)).toEqual([BOOKMARK_ROOT_BAR, BOOKMARK_ROOT_OTHER]);
    expect(tree.every((n) => n.type === 'folder')).toBe(true);
  });
});

describe.skipIf(skipWithoutNativeSqlite())('BookmarkTreeStore — create + order', () => {
  it('appends children in creation order', () => {
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'A',
      url: 'https://a.com/',
    });
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'B',
      url: 'https://b.com/',
    });
    BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'F' });
    expect(titles(BOOKMARK_ROOT_BAR)).toEqual(['A', 'B', 'F']);
  });

  it('inserts at an explicit index', () => {
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'A',
      url: 'https://a.com/',
    });
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'C',
      url: 'https://c.com/',
    });
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'B',
      url: 'https://b.com/',
      index: 1,
    });
    expect(titles(BOOKMARK_ROOT_BAR)).toEqual(['A', 'B', 'C']);
  });
});

describe.skipIf(skipWithoutNativeSqlite())('BookmarkTreeStore — move (reorder + reparent)', () => {
  it('reorders within a parent', () => {
    const a = BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'A',
      url: 'https://a.com/',
    });
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'B',
      url: 'https://b.com/',
    });
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'C',
      url: 'https://c.com/',
    });
    BookmarkTreeStore.move(db, a, BOOKMARK_ROOT_BAR, 2); // A to the end
    expect(titles(BOOKMARK_ROOT_BAR)).toEqual(['B', 'C', 'A']);
  });

  it('moves a bookmark into a folder', () => {
    const f = BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'F' });
    const a = BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: 'A',
      url: 'https://a.com/',
    });
    BookmarkTreeStore.move(db, a, f, 0);
    expect(titles(BOOKMARK_ROOT_BAR)).toEqual(['F']);
    expect(titles(f)).toEqual(['A']);
  });

  it('refuses to move a folder into its own descendant (cycle guard)', () => {
    const parent = BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'P' });
    const child = BookmarkTreeStore.createFolder(db, { parentId: parent, title: 'C' });
    BookmarkTreeStore.move(db, parent, child, 0); // no-op
    expect(BookmarkTreeStore.getNode(db, parent)?.parentId).toBe(BOOKMARK_ROOT_BAR);
    expect(BookmarkTreeStore.getNode(db, child)?.parentId).toBe(parent);
  });

  it('refuses to move a root', () => {
    BookmarkTreeStore.move(db, BOOKMARK_ROOT_BAR, BOOKMARK_ROOT_OTHER, 0);
    expect(BookmarkTreeStore.getNode(db, BOOKMARK_ROOT_BAR)?.parentId).toBeNull();
  });
});

describe.skipIf(skipWithoutNativeSqlite())('BookmarkTreeStore — remove', () => {
  it('deletes a folder and all its descendants (cascade)', () => {
    const f = BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'F' });
    const sub = BookmarkTreeStore.createFolder(db, { parentId: f, title: 'Sub' });
    BookmarkTreeStore.createBookmark(db, { parentId: sub, title: 'Deep', url: 'https://d.com/' });
    BookmarkTreeStore.remove(db, f);
    expect(titles(BOOKMARK_ROOT_BAR)).toEqual([]);
    expect(BookmarkTreeStore.getNode(db, sub)).toBeNull();
    expect(BookmarkTreeStore.isBookmarkedAnywhere(db, 'https://d.com/')).toBe(false);
  });

  it('refuses to delete a root', () => {
    BookmarkTreeStore.remove(db, BOOKMARK_ROOT_BAR);
    expect(BookmarkTreeStore.getNode(db, BOOKMARK_ROOT_BAR)).not.toBeNull();
  });
});

describe.skipIf(skipWithoutNativeSqlite())(
  'BookmarkTreeStore — star helpers + flat projection',
  () => {
    it('toggleAtBar adds to the bar, then removes every instance', () => {
      expect(BookmarkTreeStore.toggleAtBar(db, 'https://x.com/', 'X')).toBe(true);
      // A manual duplicate in another folder.
      BookmarkTreeStore.createBookmark(db, {
        parentId: BOOKMARK_ROOT_OTHER,
        title: 'X2',
        url: 'https://x.com/',
      });
      expect(BookmarkTreeStore.findByUrl(db, 'https://x.com/')).toHaveLength(2);
      expect(BookmarkTreeStore.toggleAtBar(db, 'https://x.com/', 'X')).toBe(false); // un-star removes all
      expect(BookmarkTreeStore.isBookmarkedAnywhere(db, 'https://x.com/')).toBe(false);
    });

    it('listFlat returns bookmarks only (no folders), newest-first', () => {
      BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'Folder' });
      BookmarkTreeStore.createBookmark(db, {
        parentId: BOOKMARK_ROOT_BAR,
        title: 'Old',
        url: 'https://old.com/',
      });
      BookmarkTreeStore.createBookmark(db, {
        parentId: BOOKMARK_ROOT_BAR,
        title: 'New',
        url: 'https://new.com/',
      });
      const flat = BookmarkTreeStore.listFlat(db);
      expect(flat.map((e) => e.title)).toEqual(['New', 'Old']);
    });

    it('search matches url and title (bookmarks only)', () => {
      BookmarkTreeStore.createBookmark(db, {
        parentId: BOOKMARK_ROOT_BAR,
        title: 'Hello',
        url: 'https://example.com/',
      });
      BookmarkTreeStore.createFolder(db, { parentId: BOOKMARK_ROOT_BAR, title: 'example-folder' });
      expect(BookmarkTreeStore.search(db, 'example').map((e) => e.url)).toEqual([
        'https://example.com/',
      ]);
    });
  },
);
