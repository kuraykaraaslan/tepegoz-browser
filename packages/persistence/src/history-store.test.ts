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

  describe('searchForOmnibox — frequency-shaped candidate window (omnibox track § A4)', () => {
    const DAY = 24 * 60 * 60 * 1000;

    /** Give a url a specific visit count without 100 `record` calls. */
    function seed(url: string, title: string, ts: number, visits: number): void {
      HistoryStore.record(db, { url, title, ts });
      db.prepare('UPDATE history SET visit_count = ? WHERE url = ?').run(visits, url);
    }

    it('returns a heavily-visited old match that a recency-only window would drop', () => {
      const now = 1000 * DAY;
      // 55 pages all matching "site", each seen once, all more recent than the favourite.
      for (let i = 0; i < 55; i++) {
        seed(`https://recent-${String(i)}.ex/`, `Recent site ${String(i)}`, now - (i + 10) * DAY, 1);
      }
      // The page the user actually lives on: old last-visit, but 200 visits.
      seed('https://fav.ex/', 'Favourite site', now - 400 * DAY, 200);

      // The recency-ordered window (limit 50) never even sees it.
      expect(HistoryStore.search(db, 'site', 50).map((e) => e.url)).not.toContain('https://fav.ex/');

      // The omnibox window puts it first — the frequency ranker downstream can finally score it.
      const omni = HistoryStore.searchForOmnibox(db, 'site', now, 50);
      expect(omni[0]?.url).toBe('https://fav.ex/');
      expect(omni.map((e) => e.url)).toContain('https://fav.ex/');
    });

    it('ranks the fresher of two equally-visited matches first — recency still contributes', () => {
      const now = 1000 * DAY;
      seed('https://fresh-tie.ex/', 'Fresh tie site', now - 1 * DAY, 5);
      seed('https://old-tie.ex/', 'Old tie site', now - 60 * DAY, 5);
      expect(HistoryStore.searchForOmnibox(db, 'site', now, 10).map((e) => e.url)).toEqual([
        'https://fresh-tie.ex/',
        'https://old-tie.ex/',
      ]);
    });

    it('is a pure function of nowTs — the same rows reorder as time moves on', () => {
      const t0 = 1000 * DAY;
      // A recent page with a modest count, and an older page visited nearly twice as often.
      seed('https://fresh.ex/', 'Fresh site', t0 - 1 * DAY, 10);
      seed('https://steady.ex/', 'Steady site', t0 - 30 * DAY, 18);

      // Near t0 the freshness bonus carries the recent page past the steadier one.
      expect(HistoryStore.searchForOmnibox(db, 'site', t0, 10)[0]?.url).toBe('https://fresh.ex/');
      // Two months on the bonus has decayed to nothing and raw frequency wins.
      expect(HistoryStore.searchForOmnibox(db, 'site', t0 + 60 * DAY, 10)[0]?.url).toBe(
        'https://steady.ex/',
      );
    });

    it('clamps a future last-visit rather than dividing the score by ~zero', () => {
      const now = 1000 * DAY;
      seed('https://future.ex/', 'Future site', now + 5 * DAY, 2);
      seed('https://normal.ex/', 'Normal site', now - DAY, 2);
      // Both come back, ordered, with finite scores — no NaN row, no crash.
      const rows = HistoryStore.searchForOmnibox(db, 'site', now, 10);
      expect(rows.map((e) => e.url).sort()).toEqual(['https://future.ex/', 'https://normal.ex/']);
    });

    it('shares the Turkish-folded match path with search', () => {
      seed('https://sisli.ex/', 'Şişli Gezisi', 1000 * DAY, 4);
      expect(HistoryStore.searchForOmnibox(db, 'sisli', 1000 * DAY, 10).map((e) => e.title)).toEqual([
        'Şişli Gezisi',
      ]);
    });
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

  describe('favicon', () => {
    const ICON = 'data:image/png;base64,iVBORw0KGgo=';

    it('is null until captured, then round-trips through list / search / omnibox reads', () => {
      HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 1 });
      expect(HistoryStore.list(db)[0]?.favicon).toBeNull();

      HistoryStore.setFavicon(db, 'https://a.com/', ICON);
      expect(HistoryStore.list(db)[0]?.favicon).toBe(ICON);
      expect(HistoryStore.search(db, 'a.com')[0]?.favicon).toBe(ICON);
      expect(HistoryStore.searchForOmnibox(db, 'a.com', 1000)[0]?.favicon).toBe(ICON);
      expect(HistoryStore.faviconFor(db, 'https://a.com/')).toBe(ICON);
    });

    it('setFavicon is a no-op for a URL with no recorded visit (no row is created)', () => {
      HistoryStore.setFavicon(db, 'https://never-visited.com/', ICON);
      expect(HistoryStore.count(db)).toBe(0);
      expect(HistoryStore.faviconFor(db, 'https://never-visited.com/')).toBeNull();
    });

    it('setFavicon does not bump the visit count or change the title', () => {
      HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 1 });
      HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 2 });
      HistoryStore.setFavicon(db, 'https://a.com/', ICON);
      expect(HistoryStore.list(db)[0]).toMatchObject({ title: 'A', visitCount: 2, favicon: ICON });
    });

    it('a repeat visit keeps the captured favicon (the upsert leaves the column alone)', () => {
      HistoryStore.record(db, { url: 'https://a.com/', title: 'A', ts: 1 });
      HistoryStore.setFavicon(db, 'https://a.com/', ICON);
      HistoryStore.record(db, { url: 'https://a.com/', title: 'A v2', ts: 2 });
      expect(HistoryStore.list(db)[0]).toMatchObject({ title: 'A v2', favicon: ICON });
    });
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
