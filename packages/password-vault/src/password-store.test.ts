import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '@tepegoz/persistence';
import { PasswordStore } from './password-store';

/**
 * `PasswordStore` — the SQLite seam under the vault. `password-vault.test.ts` mocks it out to test the
 * vault's crypto/dedupe logic; this exercises the real CRUD against a `:memory:` DB, including the
 * `ON CONFLICT(url, username)` upsert (the same (url, username) updates in place, keeping `created_at`).
 */

let db: Db;
const rec = (over: Partial<Parameters<typeof PasswordStore.upsert>[1]> = {}) => ({
  id: 'c1',
  url: 'https://site.test',
  username: 'ada',
  encryptedPw: 'enc-1',
  title: 'Site',
  notes: '',
  providerId: 'local',
  createdAt: 1_000,
  updatedAt: 1_000,
  ...over,
});

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('PasswordStore', () => {
  it('upsert then list / findById / findByUrl round-trip a row', () => {
    PasswordStore.upsert(db, rec());

    expect(PasswordStore.list(db)).toEqual([
      {
        id: 'c1',
        url: 'https://site.test',
        username: 'ada',
        title: 'Site',
        notes: '',
        providerId: 'local',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ]);
    expect(PasswordStore.findById(db, 'c1')).toMatchObject({ encryptedPassword: 'enc-1' });
    expect(PasswordStore.findByUrl(db, 'https://site.test')).toHaveLength(1);
  });

  it('findById / list return null / empty for a miss', () => {
    expect(PasswordStore.findById(db, 'ghost')).toBeNull();
    expect(PasswordStore.list(db)).toEqual([]);
    expect(PasswordStore.findByUrl(db, 'https://nope.test')).toEqual([]);
  });

  it('scopes list() to the provider id', () => {
    PasswordStore.upsert(db, rec({ id: 'a', username: 'ada', providerId: 'local' }));
    PasswordStore.upsert(db, rec({ id: 'b', username: 'bo', providerId: 'work' }));
    expect(PasswordStore.list(db).map((r) => r.id)).toEqual(['a']);
    expect(PasswordStore.list(db, 'work').map((r) => r.id)).toEqual(['b']);
  });

  it('upsert on the same (url, username) updates in place and keeps created_at', () => {
    PasswordStore.upsert(db, rec());
    PasswordStore.upsert(
      db,
      rec({ id: 'c2', encryptedPw: 'enc-2', title: 'Renamed', notes: 'n', updatedAt: 2_000 }),
    );

    const all = PasswordStore.list(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'c1', title: 'Renamed', notes: 'n', createdAt: 1_000, updatedAt: 2_000 });
    expect(PasswordStore.findById(db, 'c1')).toMatchObject({ encryptedPassword: 'enc-2' });
  });

  it('list() orders by updated_at DESC', () => {
    PasswordStore.upsert(db, rec({ id: 'old', username: 'old', updatedAt: 1_000 }));
    PasswordStore.upsert(db, rec({ id: 'new', username: 'new', updatedAt: 5_000 }));
    expect(PasswordStore.list(db).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('remove deletes the row', () => {
    PasswordStore.upsert(db, rec());
    PasswordStore.remove(db, 'c1');
    expect(PasswordStore.findById(db, 'c1')).toBeNull();
  });
});
