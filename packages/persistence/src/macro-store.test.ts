import { beforeEach, describe, it, expect } from 'vitest';
import { skipWithoutNativeSqlite } from './native-abi';
import type { Macro } from '@tepegoz/shared-types';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { MacroStore } from './macro-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const macro = (id: string, name: string): Macro => ({
  id,
  name,
  version: 1,
  variables: [],
  steps: [
    { kind: 'navigate', url: 'https://x' },
    { kind: 'click', target: [{ kind: 'css', value: '#go' }] },
  ],
});

describe.skipIf(skipWithoutNativeSqlite())('MacroStore', () => {
  it('saves and reads back the full IR', () => {
    MacroStore.save(db, macro('m1', 'Login'), 1000);
    const got = MacroStore.get(db, 'm1');
    expect(got?.name).toBe('Login');
    expect(got?.steps).toHaveLength(2);
  });

  it('lists newest-first with a step count', () => {
    MacroStore.save(db, macro('m1', 'A'), 1000);
    MacroStore.save(db, macro('m2', 'B'), 2000);
    const list = MacroStore.list(db);
    expect(list.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(list[0]).toMatchObject({ name: 'B', stepCount: 2, updatedAt: 2000 });
  });

  it('upserts on id (re-save updates name/ir, not a duplicate)', () => {
    MacroStore.save(db, macro('m1', 'A'), 1000);
    MacroStore.save(db, { ...macro('m1', 'A v2'), steps: [{ kind: 'waitMs', ms: 5 }] }, 2000);
    expect(MacroStore.count(db)).toBe(1);
    const got = MacroStore.get(db, 'm1');
    expect(got?.name).toBe('A v2');
    expect(got?.steps).toEqual([{ kind: 'waitMs', ms: 5 }]);
  });

  it('deletes', () => {
    MacroStore.save(db, macro('m1', 'A'), 1000);
    MacroStore.delete(db, 'm1');
    expect(MacroStore.get(db, 'm1')).toBeNull();
    expect(MacroStore.count(db)).toBe(0);
  });

  it('get returns null for an unknown id', () => {
    expect(MacroStore.get(db, 'nope')).toBeNull();
  });
});
