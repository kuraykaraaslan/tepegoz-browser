import { beforeEach, describe, it, expect } from 'vitest';
import { skipWithoutNativeSqlite } from './native-abi';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { HistoryStore } from './history-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe.skipIf(skipWithoutNativeSqlite())('HistoryStore', () => {
  it('records a visit and lists it', () => {
    HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    const list = HistoryStore.list(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: 'https://a.com/', title: 'A', visitCount: 1 });
  });

  it('coalesces repeat visits by url (bumps count + ts + title)', () => {
    HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    HistoryStore.record(db, { url: 'https://a.com/', title: 'A v2', ts: 200 });
    const list = HistoryStore.list(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'A v2', ts: 200, visitCount: 2 });
  });

  it('lists newest-first', () => {
    HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 100 });
    HistoryStore.record(db, { url: 'https://b.com/', title: 'B', ts: 300 });
    HistoryStore.record(db, { url: 'https://c.com/', title: 'C', ts: 200 });
    expect(HistoryStore.list(db).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://c.com/',
      'https://a.com/',
    ]);
  });

  it('searches url and title (case-insensitive)', () => {
    HistoryStore.record(db, { url: 'https://example.com/', title: 'Hello', ts: 1 });
    HistoryStore.record(db, { url: 'https://other.com/', title: 'World', ts: 2 });
    expect(HistoryStore.search(db, 'example').map((e) => e.url)).toEqual(['https://example.com/']);
    expect(HistoryStore.search(db, 'World').map((e) => e.title)).toEqual(['World']);
  });

  it('setTitle refines the title without bumping the visit count', () => {
    HistoryStore.record(db, { url: 'https://a.com/', title: 'a.com', ts: 1 });
    HistoryStore.setTitle(db, 'https://a.com/', 'Real Title');
    expect(HistoryStore.list(db)[0]).toMatchObject({ title: 'Real Title', visitCount: 1 });
  });

  it('deletes one url and clears all', () => {
    HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 1 });
    HistoryStore.record(db, { url: 'https://b.com/', title: 'B', ts: 2 });
    HistoryStore.deleteUrl(db, 'https://a.com/');
    expect(HistoryStore.list(db).map((e) => e.url)).toEqual(['https://b.com/']);
    HistoryStore.clear(db);
    expect(HistoryStore.count(db)).toBe(0);
  });

  it('prunes entries older than the retention window, keeps the rest', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 200 * day;
    HistoryStore.record(db, { url: 'https://old.com/', title: 'Old', ts: now - 91 * day });
    HistoryStore.record(db, { url: 'https://edge.com/', title: 'Edge', ts: now - 90 * day });
    HistoryStore.record(db, { url: 'https://new.com/', title: 'New', ts: now - day });
    const pruned = HistoryStore.prune(db, now);
    expect(pruned).toBe(1);
    expect(HistoryStore.list(db).map((e) => e.url)).toEqual([
      'https://new.com/',
      'https://edge.com/',
    ]);
  });
});
