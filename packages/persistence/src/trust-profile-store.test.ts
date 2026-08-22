import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { TrustProfileStore } from './trust-profile-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('TrustProfileStore', () => {
  it('stores a level and reads it back', () => {
    TrustProfileStore.put(db, 'github.com', 'trusted');
    const [profile] = TrustProfileStore.list(db);
    expect(profile?.domain).toBe('github.com');
    expect(profile?.level).toBe('trusted');
  });

  it('carries sync metadata on every row, so sync is not a later migration', () => {
    TrustProfileStore.put(db, 'github.com', 'trusted');
    const [profile] = TrustProfileStore.list(db);
    expect(profile?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile?.deviceId.length).toBeGreaterThan(0);
    expect(profile?.updatedAt).toBeGreaterThan(0);
    expect(profile?.version).toBe(1);
  });

  it('keeps ONE row per site when the level is set twice', () => {
    // Two live rows for one domain would make "which level is in force" an ordering accident, and for
    // this table that accident is the difference between restricted and trusted.
    TrustProfileStore.put(db, 'github.com', 'trusted');
    TrustProfileStore.put(db, 'github.com', 'restricted');
    const live = TrustProfileStore.list(db);
    expect(live).toHaveLength(1);
    expect(live[0]?.level).toBe('restricted');
    expect(live[0]?.version).toBe(2);
  });

  it('soft-deletes, so the revocation can propagate to another device', () => {
    TrustProfileStore.put(db, 'github.com', 'trusted');
    TrustProfileStore.remove(db, 'github.com');
    expect(TrustProfileStore.list(db)).toEqual([]);
    const row = db
      .prepare('SELECT tombstone FROM trust_profiles WHERE domain = ?')
      .get('github.com');
    expect(row).toBeDefined();
  });

  it('revives a removed site when the user sets a level on it again', () => {
    TrustProfileStore.put(db, 'github.com', 'trusted');
    TrustProfileStore.remove(db, 'github.com');
    TrustProfileStore.put(db, 'github.com', 'restricted');
    expect(TrustProfileStore.list(db).map((p) => p.level)).toEqual(['restricted']);
  });

  it('drops an invalid row instead of returning it — and the fallback is the SAFE direction', () => {
    // A row the schema rejects falls back to `default`, the middle level. That means a corrupt row can
    // lose a user's `restricted` setting, but can never manufacture a `trusted` one.
    TrustProfileStore.put(db, 'github.com', 'trusted');
    db.prepare('UPDATE trust_profiles SET id = ? WHERE domain = ?').run('not-a-uuid', 'github.com');
    expect(TrustProfileStore.list(db)).toEqual([]);
  });

  it('refuses a level the code has no branch for, at the storage layer', () => {
    // The CHECK exists so a hand-edited database cannot introduce a fourth level.
    expect(() =>
      db
        .prepare(
          `INSERT INTO trust_profiles (id, domain, level, device_id, updated_at, version, tombstone)
           VALUES ('x', 'evil.test', 'admin', 'd', 1, 1, 0)`,
        )
        .run(),
    ).toThrow();
  });
});
