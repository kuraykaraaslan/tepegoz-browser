import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { MetaStore } from './meta';
import { SessionStore, type SessionSnapshot, type WindowSnapshot } from './session-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const win = (over: Partial<WindowSnapshot> = {}): WindowSnapshot => ({
  tabs: [{ url: 'https://a.com/', pinned: false, groupId: null }],
  groups: [],
  activeIndex: 0,
  ...over,
});

const v3 = (windows: WindowSnapshot[]): SessionSnapshot => ({ version: 3, windows });

describe('SessionStore', () => {
  it('returns null when no session was ever saved', () => {
    expect(SessionStore.load(db)).toBeNull();
  });

  it('round-trips a v3 snapshot with multiple windows, groups + pins + bounds', () => {
    const snap = v3([
      win({
        tabs: [
          { url: 'https://a.com/', pinned: true, groupId: null },
          { url: 'https://b.com/', pinned: false, groupId: 'g1' },
          { url: 'https://c.com/', pinned: false, groupId: 'g1' },
        ],
        groups: [{ id: 'g1', name: 'Work', color: 'red', collapsed: false, settings: { 'agent.panelOpen': true } }],
        activeIndex: 1,
        bounds: { x: 10, y: 20, width: 1200, height: 800 },
      }),
      win({ tabs: [{ url: 'https://d.com/', pinned: false, groupId: null }], activeIndex: 0 }),
    ]);
    SessionStore.save(db, snap);
    expect(SessionStore.load(db)).toEqual(snap);
  });

  it('round-trips a hidden tab and omits the field for visible tabs', () => {
    const snap = v3([
      win({
        tabs: [
          { url: 'https://a.com/', pinned: false, groupId: null },
          { url: 'https://b.com/', pinned: false, groupId: null, hidden: true },
        ],
        activeIndex: 0,
      }),
    ]);
    SessionStore.save(db, snap);
    const loaded = SessionStore.load(db);
    expect(loaded).toEqual(snap); // hidden:true survives; the visible tab carries no `hidden` field
    expect('hidden' in (loaded?.windows[0]?.tabs[0] ?? {})).toBe(false);
  });

  it('treats an explicit hidden:false (or absent) as visible — no field added', () => {
    MetaStore.set(
      db,
      'session',
      JSON.stringify({
        version: 3,
        windows: [
          { tabs: [{ url: 'https://a.com/', pinned: false, groupId: null, hidden: false }], groups: [], activeIndex: 0 },
        ],
      }),
    );
    expect(SessionStore.load(db)?.windows[0]?.tabs[0]?.hidden).toBeUndefined();
  });

  it('defaults a persisted group\'s settings to {} when absent or malformed', () => {
    MetaStore.set(
      db,
      'session',
      JSON.stringify({
        version: 3,
        windows: [
          {
            tabs: [{ url: 'https://a.com/', pinned: false, groupId: 'g1' }],
            groups: [{ id: 'g1', name: 'Work', color: 'red', collapsed: false }], // no `settings` key
            activeIndex: 0,
          },
        ],
      }),
    );
    expect(SessionStore.load(db)?.windows[0]?.groups[0]?.settings).toEqual({});
  });

  it('upconverts a single-window v2 snapshot to a one-window v3 snapshot', () => {
    MetaStore.set(
      db,
      'session',
      JSON.stringify({
        version: 2,
        tabs: [
          { url: 'https://a.com/', pinned: true, groupId: null },
          { url: 'https://b.com/', pinned: false, groupId: 'g1' },
        ],
        groups: [{ id: 'g1', name: 'Work', color: 'red', collapsed: false, settings: {} }],
        activeIndex: 1,
      }),
    );
    expect(SessionStore.load(db)).toEqual(
      v3([
        win({
          tabs: [
            { url: 'https://a.com/', pinned: true, groupId: null },
            { url: 'https://b.com/', pinned: false, groupId: 'g1' },
          ],
          groups: [{ id: 'g1', name: 'Work', color: 'red', collapsed: false, settings: {} }],
          activeIndex: 1,
        }),
      ]),
    );
  });

  it('upconverts a legacy v1 snapshot (string[] tabs) to v3', () => {
    MetaStore.set(db, 'session', JSON.stringify({ tabs: ['https://a.com/', 'https://b.com/'], activeIndex: 1 }));
    expect(SessionStore.load(db)).toEqual(
      v3([
        {
          tabs: [
            { url: 'https://a.com/', pinned: false, groupId: null },
            { url: 'https://b.com/', pinned: false, groupId: null },
          ],
          groups: [],
          activeIndex: 1,
        },
      ]),
    );
  });

  it('overwrites the previous snapshot on save', () => {
    SessionStore.save(db, v3([win({ tabs: [{ url: 'https://a.com/', pinned: false, groupId: null }] })]));
    SessionStore.save(db, v3([win({ tabs: [{ url: 'https://x.com/', pinned: false, groupId: null }] })]));
    expect(SessionStore.load(db)?.windows[0]?.tabs.map((t) => t.url)).toEqual(['https://x.com/']);
  });

  it('clear() empties the snapshot', () => {
    SessionStore.save(db, v3([win()]));
    SessionStore.clear(db);
    expect(SessionStore.load(db)).toEqual({ version: 3, windows: [] });
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
    MetaStore.set(db, 'session', JSON.stringify({ version: 99, windows: [] }));
    expect(SessionStore.load(db)).toBeNull();
  });

  it('returns null when a v3 window has a non-string tab url', () => {
    MetaStore.set(
      db,
      'session',
      JSON.stringify({ version: 3, windows: [{ tabs: [{ url: 5 }], groups: [], activeIndex: 0 }] }),
    );
    expect(SessionStore.load(db)).toBeNull();
  });
});
