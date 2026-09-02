import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Db } from '@tepegoz/persistence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProfileBookmarks } from './browser-profile-read';
import type { DetectedBrowserProfile } from './browser-profiles';
import type { ImportedBookmarkNode } from './bookmark-import-limits';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-read-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function profile(over: Partial<DetectedBrowserProfile>): DetectedBrowserProfile {
  return {
    id: 'test:0',
    source: 'chrome',
    browserLabel: 'Chrome',
    profileName: 'Default',
    format: 'chromium-json',
    path: join(dir, 'Bookmarks'),
    modifiedAt: 0,
    ...over,
  };
}

function children(node: ImportedBookmarkNode | undefined): ImportedBookmarkNode[] {
  return node !== undefined && node.type === 'folder' ? node.children : [];
}

/** A `places.sqlite` with the two tables and the columns the importer reads. */
function writePlaces(path: string): Db {
  const db = openDatabase(path);
  db.exec(`
    CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT);
    CREATE TABLE moz_bookmarks (
      id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER,
      position INTEGER, title TEXT, guid TEXT
    );
    INSERT INTO moz_places (id, url) VALUES (1, 'https://mozilla.example');
    INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid)
      VALUES (5, 2, NULL, 1, 0, 'Other Bookmarks', 'unfiled_____'),
             (6, 1, 1, 5, 0, 'Mozilla', NULL);
  `);
  return db;
}

describe('readProfileBookmarks', () => {
  it('reads a Chromium profile file', () => {
    writeFileSync(
      join(dir, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: { type: 'folder', name: 'Bar', children: [] },
          other: {
            type: 'folder',
            name: 'Other',
            children: [{ type: 'url', name: 'Page', url: 'https://page.example' }],
          },
        },
      }),
    );
    const parsed = readProfileBookmarks(profile({}));
    expect(children(parsed!.root.children[1]).map((n) => n.title)).toEqual(['Page']);
  });

  it('reads a Firefox profile while the database is still open', () => {
    // The realistic case: the user is importing minutes after switching browsers, so Firefox — or at
    // least its lock — is still around. This is what the copy-to-temp exists for; opening the live file
    // fails exactly when the feature is most likely to be used.
    const path = join(dir, 'places.sqlite');
    const held = writePlaces(path);
    try {
      const parsed = readProfileBookmarks(profile({ format: 'firefox-places', path }));
      expect(children(parsed!.root.children[0]).map((n) => n.title)).toEqual(['Mozilla']);
    } finally {
      held.close();
    }
  });

  it('never writes to the profile it reads', () => {
    // Opening a SQLite file mutates it — journal mode, the -wal and -shm sidecars. A browser that
    // quietly wrote into another browser's profile while "reading" it would deserve the complaint.
    const path = join(dir, 'places.sqlite');
    writePlaces(path).close();
    const before = readdirSync(dir).sort();
    readProfileBookmarks(profile({ format: 'firefox-places', path }));
    expect(readdirSync(dir).sort()).toEqual(before);
  });

  it('leaves no scratch copy behind', () => {
    const path = join(dir, 'places.sqlite');
    writePlaces(path).close();
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('tepegoz-import-')).length;
    readProfileBookmarks(profile({ format: 'firefox-places', path }));
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith('tepegoz-import-')).length).toBe(before);
  });

  it('returns null rather than throwing for a missing or unreadable file', () => {
    expect(readProfileBookmarks(profile({ path: join(dir, 'nope') }))).toBeNull();
    writeFileSync(join(dir, 'Bookmarks'), 'not json');
    expect(readProfileBookmarks(profile({}))).toBeNull();

    const notADb = join(dir, 'places.sqlite');
    writeFileSync(notADb, 'this is not a database');
    expect(readProfileBookmarks(profile({ format: 'firefox-places', path: notADb }))).toBeNull();
  });
});
