import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { BookmarkStore } from './bookmark-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('BookmarkStore', () => {
  it('adds a bookmark and lists it', () => {
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    const list = BookmarkStore.list(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: 'https://a.com/', title: 'A', ts: 100 });
  });

  it('is idempotent on url — re-adding refreshes the title, not a duplicate', () => {
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A v2', ts: 200 });
    const list = BookmarkStore.list(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'A v2', ts: 100 }); // ts (created) preserved
  });

  it('reports isBookmarked correctly', () => {
    expect(BookmarkStore.isBookmarked(db, 'https://a.com/')).toBe(false);
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A', ts: 1 });
    expect(BookmarkStore.isBookmarked(db, 'https://a.com/')).toBe(true);
  });

  it('lists newest-first', () => {
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    BookmarkStore.add(db, { url: 'https://b.com/', title: 'B', ts: 300 });
    BookmarkStore.add(db, { url: 'https://c.com/', title: 'C', ts: 200 });
    expect(BookmarkStore.list(db).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://c.com/',
      'https://a.com/',
    ]);
  });

  it('searches url and title (case-insensitive)', () => {
    BookmarkStore.add(db, { url: 'https://example.com/', title: 'Hello', ts: 1 });
    BookmarkStore.add(db, { url: 'https://other.com/', title: 'World', ts: 2 });
    expect(BookmarkStore.search(db, 'example').map((e) => e.url)).toEqual(['https://example.com/']);
    expect(BookmarkStore.search(db, 'world').map((e) => e.title)).toEqual(['World']);
  });

  it('removes a bookmark', () => {
    BookmarkStore.add(db, { url: 'https://a.com/', title: 'A', ts: 1 });
    BookmarkStore.add(db, { url: 'https://b.com/', title: 'B', ts: 2 });
    BookmarkStore.remove(db, 'https://a.com/');
    expect(BookmarkStore.list(db).map((e) => e.url)).toEqual(['https://b.com/']);
    expect(BookmarkStore.count(db)).toBe(1);
  });
});
