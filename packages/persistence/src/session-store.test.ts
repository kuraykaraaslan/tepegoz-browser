import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { MetaStore } from './meta';
import { SessionStore, type SessionSnapshot } from './session-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const v2 = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  version: 2,
  tabs: [{ url: 'https://a.com/', pinned: false, groupId: null }],
  groups: [],
  activeIndex: 0,
  ...over,
});

describe('SessionStore', () => {
  it('returns null when no session was ever saved', () => {
    expect(SessionStore.load(db)).toBeNull();
  });

  it('round-trips a v2 snapshot with groups + pins', () => {
    const snap = v2({
      tabs: [
        { url: 'https://a.com/', pinned: true, groupId: null },
        { url: 'https://b.com/', pinned: false, groupId: 'g1' },
        { url: 'https://c.com/', pinned: false, groupId: 'g1' },
      ],
      groups: [{ id: 'g1', name: 'Work', color: 'red', collapsed: false, settings: { 'agent.panelOpen': true } }],
      activeIndex: 1,
    });
    SessionStore.save(db, snap);
    expect(SessionStore.load(db)).toEqual(snap);
  });

  it('defaults a persisted group\'s settings to {} when absent or malformed', () => {
    MetaStore.set(
      db,
      'session',
      JSON.stringify({
        version: 2,
        tabs: [{ url: 'https://a.com/', pinned: false, groupId: 'g1' }],
        groups: [
          { id: 'g1', name: 'Work', color: 'red', collapsed: false }, // no `settings` key at all
        ],
        activeIndex: 0,
      }),
    );
    expect(SessionStore.load(db)?.groups[0]?.settings).toEqual({});
  });

  it('upconverts a legacy v1 snapshot (string[] tabs) to v2', () => {
    // Simulate a snapshot written by the previous app version.
    MetaStore.set(db, 'session', JSON.stringify({ tabs: ['https://a.com/', 'https://b.com/'], activeIndex: 1 }));
    expect(SessionStore.load(db)).toEqual({
      version: 2,
      tabs: [
        { url: 'https://a.com/', pinned: false, groupId: null },
        { url: 'https://b.com/', pinned: false, groupId: null },
      ],
      groups: [],
      activeIndex: 1,
    });
  });

  it('overwrites the previous snapshot on save', () => {
    SessionStore.save(db, v2({ tabs: [{ url: 'https://a.com/', pinned: false, groupId: null }] }));
    SessionStore.save(db, v2({ tabs: [{ url: 'https://x.com/', pinned: false, groupId: null }] }));
    expect(SessionStore.load(db)?.tabs.map((t) => t.url)).toEqual(['https://x.com/']);
  });

  it('clear() empties the snapshot', () => {
    SessionStore.save(db, v2());
    SessionStore.clear(db);
    expect(SessionStore.load(db)).toEqual({ version: 2, tabs: [], groups: [], activeIndex: -1 });
  });

  it('returns null for malformed JSON', () => {
    MetaStore.set(db, 'session', '{not json');
    expect(SessionStore.load(db)).toBeNull();
  });

  it('returns null for a valid-JSON but wrong-shape value', () => {
    MetaStore.set(db, 'session', JSON.stringify({ tabs: [{ nope: 1 }], activeIndex: 'x' }));
    expect(SessionStore.load(db)).toBeNull();
  });

  it('returns null for an unknown future version', () => {
    MetaStore.set(db, 'session', JSON.stringify({ version: 99, tabs: [], groups: [], activeIndex: -1 }));
    expect(SessionStore.load(db)).toBeNull();
  });

  it('drops a v2 tab with a non-string url', () => {
    MetaStore.set(db, 'session', JSON.stringify({ version: 2, tabs: [{ url: 5 }], groups: [], activeIndex: 0 }));
    expect(SessionStore.load(db)).toBeNull();
  });
});
