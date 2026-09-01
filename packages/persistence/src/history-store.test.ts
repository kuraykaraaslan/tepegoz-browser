import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { HistoryStore } from './history-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('HistoryStore', () => {
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

  it('finds Turkish titles across the dotted/dotless i family and accents (omnibox track § A2)', () => {
    HistoryStore.record(db, { url: 'https://sisli.example/', title: 'Şişli Gezisi', ts: 1 });
    HistoryStore.record(db, { url: 'https://urunler.example/', title: 'Ürünler', ts: 2 });
    HistoryStore.record(db, { url: 'https://istanbul.example/', title: 'İSTANBUL Rehberi', ts: 3 });

    // SQLite's built-in LIKE returned 0 for every one of these before the folded shadow columns.
    expect(HistoryStore.search(db, 'şişli').map((e) => e.title)).toEqual(['Şişli Gezisi']);
    expect(HistoryStore.search(db, 'sisli').map((e) => e.title)).toEqual(['Şişli Gezisi']);
    expect(HistoryStore.search(db, 'ürünler').map((e) => e.title)).toEqual(['Ürünler']);
    expect(HistoryStore.search(db, 'urunler').map((e) => e.title)).toEqual(['Ürünler']);
    expect(HistoryStore.search(db, 'istanbul').map((e) => e.title)).toEqual(['İSTANBUL Rehberi']);
  });

  it('treats LIKE wildcards in the query as literals, not "match everything" (omnibox track § A3)', () => {
    HistoryStore.record(db, { url: 'https://a.example/', title: 'Alpha', ts: 1 });
    HistoryStore.record(db, { url: 'https://b.example/', title: 'Beta', ts: 2 });
    HistoryStore.record(db, { url: 'https://c.example/50pct/', title: 'Off 50% today', ts: 3 });
    HistoryStore.record(db, { url: 'https://d.example/a_b/', title: 'a_b path', ts: 4 });

    // Bare wildcards used to return the whole table.
    expect(HistoryStore.search(db, '%')).toHaveLength(1);
    expect(HistoryStore.search(db, '%')[0]?.title).toBe('Off 50% today');
    expect(HistoryStore.search(db, '_')).toHaveLength(1);
    expect(HistoryStore.search(db, '_')[0]?.title).toBe('a_b path');
    // A literal run with a wildcard in the middle still matches that one row.
    expect(HistoryStore.search(db, '50%').map((e) => e.title)).toEqual(['Off 50% today']);
  });

  it('keeps the folded shadow in sync when a title is refined', () => {
    HistoryStore.record(db, { url: 'https://a.example/', title: 'a.example', ts: 1 });
    HistoryStore.setTitle(db, 'https://a.example/', 'Çalışma Notları');
    expect(HistoryStore.search(db, 'calisma').map((e) => e.title)).toEqual(['Çalışma Notları']);
  });

  it('reindexFoldsIfStale backfills rows written before the fold columns existed, then no-ops', () => {
    // A pre-v16 row: fold columns left at their DEFAULT '' and no version marker in `meta`.
    db.prepare('INSERT INTO history (url, title, ts, visit_count) VALUES (?, ?, ?, 1)').run(
      'https://legacy.example/',
      'Eski Şehir',
      5,
    );
    expect(HistoryStore.search(db, 'sehir')).toHaveLength(0);

    expect(HistoryStore.reindexFoldsIfStale(db)).toBeGreaterThanOrEqual(1);
    expect(HistoryStore.search(db, 'sehir').map((e) => e.title)).toEqual(['Eski Şehir']);

    // Version marker now matches → a second call refolds nothing.
    expect(HistoryStore.reindexFoldsIfStale(db)).toBe(0);
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
