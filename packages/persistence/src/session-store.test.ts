import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { MetaStore } from './meta';
import { SessionStore } from './session-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('SessionStore', () => {
  it('returns null when no session was ever saved', () => {
    expect(SessionStore.load(db)).toBeNull();
  });

  it('round-trips a saved snapshot', () => {
    const snap = { tabs: ['https://a.com/', 'https://b.com/'], activeIndex: 1 };
    SessionStore.save(db, snap);
    expect(SessionStore.load(db)).toEqual(snap);
  });

  it('overwrites the previous snapshot on save', () => {
    SessionStore.save(db, { tabs: ['https://a.com/'], activeIndex: 0 });
    SessionStore.save(db, { tabs: ['https://x.com/', 'https://y.com/'], activeIndex: 0 });
    expect(SessionStore.load(db)?.tabs).toEqual(['https://x.com/', 'https://y.com/']);
  });

  it('clear() empties the snapshot', () => {
    SessionStore.save(db, { tabs: ['https://a.com/'], activeIndex: 0 });
    SessionStore.clear(db);
    expect(SessionStore.load(db)).toEqual({ tabs: [], activeIndex: -1 });
  });

  it('returns null for malformed JSON', () => {
    MetaStore.set(db, 'session', '{not json');
    expect(SessionStore.load(db)).toBeNull();
  });

  it('returns null for a valid-JSON but wrong-shape value', () => {
    MetaStore.set(db, 'session', JSON.stringify({ tabs: [1, 2, 3], activeIndex: 'x' }));
    expect(SessionStore.load(db)).toBeNull();
  });
});
