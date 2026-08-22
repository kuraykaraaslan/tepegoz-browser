import { randomUUID } from 'node:crypto';
import { TrustProfileSchema, type TrustLevel, type TrustProfile } from '@tepegoz/shared-types';
import type { Db } from './db';
import { MetaStore } from './meta';

/**
 * Scoped Trust Profiles — the per-site standing posture, persisted.
 *
 * Reads `safeParse` and **drop** a row that does not validate, like every other store here. For this
 * table that rule is doing more work than usual: a dropped row falls back to `default`, which is the
 * middle of the three levels, so a corrupt row loses a user's `restricted` setting rather than
 * inheriting a `trusted` one. Failing toward "ask me" is the only direction that is safe to fail in.
 *
 * Deletes are soft. A revocation specifically needs to travel — a hard-deleted row is indistinguishable
 * from a row that never synced, and for a permission that would mean an un-revoke on the second device.
 */

interface TrustRow {
  id: string;
  domain: string;
  level: string;
  device_id: string;
  updated_at: number;
  version: number;
  tombstone: number;
}

function parse(row: TrustRow): TrustProfile[] {
  const parsed = TrustProfileSchema.safeParse({
    id: row.id,
    domain: row.domain,
    level: row.level,
    deviceId: row.device_id,
    updatedAt: row.updated_at,
    version: row.version,
    tombstone: row.tombstone === 1,
  });
  return parsed.success ? [parsed.data] : [];
}

export class TrustProfileStore {
  /** Every live profile, newest setting first — the list a settings screen shows and the kernel loads. */
  static list(db: Db): TrustProfile[] {
    const rows = db
      .prepare('SELECT * FROM trust_profiles WHERE tombstone = 0 ORDER BY updated_at DESC')
      .all() as TrustRow[];
    return rows.flatMap(parse);
  }

  /**
   * Set a site's level, replacing whatever it had.
   *
   * Keyed on `domain`, not on `id`, so setting a level twice updates one row instead of racing two.
   * Re-setting a tombstoned domain revives it: the user asking for a level on a site they once removed
   * means the new answer, not a conflict.
   */
  static put(db: Db, domain: string, level: TrustLevel): void {
    db.prepare(
      `INSERT INTO trust_profiles (id, domain, level, device_id, updated_at, version, tombstone)
       VALUES (@id, @domain, @level, @deviceId, @updatedAt, 1, 0)
       ON CONFLICT(domain) DO UPDATE SET
         level = @level, updated_at = @updatedAt, tombstone = 0, version = version + 1`,
    ).run({
      id: randomUUID(),
      domain,
      level,
      deviceId: MetaStore.deviceId(db),
      updatedAt: Date.now(),
    });
  }

  /** Soft-delete a site's profile: the site goes back to `default`, and the removal can propagate. */
  static remove(db: Db, domain: string): void {
    db.prepare(
      'UPDATE trust_profiles SET tombstone = 1, updated_at = ?, version = version + 1 WHERE domain = ? AND tombstone = 0',
    ).run(Date.now(), domain);
  }
}
