import {
  DomainMemoryRecordSchema,
  RememberedGrantSchema,
  SkillRecordSchema,
  type DomainMemoryRecord,
  type RememberedGrant,
  type SkillRecord,
} from '@tepegoz/shared-types';
import type { Db } from './db';
import { MetaStore } from './meta';

/**
 * Cross-run agent memory, skills, and remembered grants (S9).
 *
 * Every read `safeParse`s and **drops** a row that does not validate rather than throwing: a row written
 * by an older build, or left by a poisoning attempt that predates the write filter, is untrusted input
 * exactly like page text. A store that trusts its own rows is one an attacker only has to reach once.
 *
 * All three tables carry sync-meta (UUID PK, `device_id`, `updated_at`, `version`, `tombstone`) from day
 * 0, so Phase-3 sync owes no migration. Deletes are soft (tombstone), because a hard delete on one
 * device is indistinguishable from a row that never synced.
 */

interface MemoryRow {
  id: string;
  host: string;
  note: string;
  descriptor_json: string | null;
  provenance: string;
  quarantined: number;
  device_id: string;
  updated_at: number;
  version: number;
  tombstone: number;
}

interface SkillRow {
  id: string;
  name: string;
  prompt: string;
  start_url: string | null;
  grant_profile: string | null;
  device_id: string;
  updated_at: number;
  version: number;
  tombstone: number;
}

interface GrantRow {
  id: string;
  scope: string;
  host: string;
  tier: string;
  expires_at: number;
  device_id: string;
  updated_at: number;
  version: number;
  tombstone: number;
}

function parseDescriptor(json: string | null): unknown {
  if (json === null) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export class AgentMemoryStore {
  /** Live (non-tombstoned) hints for one host, newest first. Invalid rows are dropped, never thrown on. */
  static hintsForHost(db: Db, host: string): DomainMemoryRecord[] {
    const rows = db
      .prepare(
        'SELECT * FROM agent_domain_memory WHERE host = ? AND tombstone = 0 ORDER BY updated_at DESC',
      )
      .all(host) as MemoryRow[];
    return rows.flatMap((row) => {
      const parsed = DomainMemoryRecordSchema.safeParse({
        id: row.id,
        host: row.host,
        note: row.note,
        descriptor: parseDescriptor(row.descriptor_json),
        provenance: row.provenance,
        quarantined: row.quarantined === 1,
        deviceId: row.device_id,
        updatedAt: row.updated_at,
        version: row.version,
        tombstone: row.tombstone === 1,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** Insert or replace one hint. The caller has already passed it through the write-side poison filter. */
  static putHint(
    db: Db,
    hint: {
      id: string;
      host: string;
      note: string;
      descriptor?: unknown;
      provenance: 'page' | 'run';
    },
  ): void {
    db.prepare(
      `INSERT INTO agent_domain_memory
         (id, host, note, descriptor_json, provenance, quarantined, device_id, updated_at, version, tombstone)
       VALUES (@id, @host, @note, @descriptor, @provenance, 0, @deviceId, @updatedAt, 1, 0)
       ON CONFLICT(id) DO UPDATE SET
         note = @note, descriptor_json = @descriptor, updated_at = @updatedAt, version = version + 1`,
    ).run({
      id: hint.id,
      host: hint.host,
      note: hint.note,
      descriptor: hint.descriptor === undefined ? null : JSON.stringify(hint.descriptor),
      provenance: hint.provenance,
      deviceId: MetaStore.deviceId(db),
      updatedAt: Date.now(),
    });
  }

  /**
   * Quarantine a hint. **Not a delete**: the row stays, auditable, and simply stops being offered — so a
   * user (or a later investigation) can still see what was planted and when.
   */
  static quarantine(db: Db, id: string): void {
    db.prepare(
      'UPDATE agent_domain_memory SET quarantined = 1, updated_at = ?, version = version + 1 WHERE id = ?',
    ).run(Date.now(), id);
  }

  /** Soft-delete. A hard delete is indistinguishable from a row that never synced. */
  static forget(db: Db, id: string): void {
    db.prepare(
      'UPDATE agent_domain_memory SET tombstone = 1, updated_at = ?, version = version + 1 WHERE id = ?',
    ).run(Date.now(), id);
  }

  static listSkills(db: Db): SkillRecord[] {
    const rows = db
      .prepare('SELECT * FROM agent_skills WHERE tombstone = 0 ORDER BY name COLLATE NOCASE')
      .all() as SkillRow[];
    return rows.flatMap((row) => {
      const parsed = SkillRecordSchema.safeParse({
        id: row.id,
        name: row.name,
        prompt: row.prompt,
        ...(row.start_url !== null ? { startUrl: row.start_url } : {}),
        ...(row.grant_profile !== null ? { grantProfile: row.grant_profile } : {}),
        deviceId: row.device_id,
        updatedAt: row.updated_at,
        version: row.version,
        tombstone: row.tombstone === 1,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  static putSkill(
    db: Db,
    skill: { id: string; name: string; prompt: string; startUrl?: string; grantProfile?: string },
  ): void {
    db.prepare(
      `INSERT INTO agent_skills
         (id, name, prompt, start_url, grant_profile, device_id, updated_at, version, tombstone)
       VALUES (@id, @name, @prompt, @startUrl, @grantProfile, @deviceId, @updatedAt, 1, 0)
       ON CONFLICT(id) DO UPDATE SET
         name = @name, prompt = @prompt, start_url = @startUrl, grant_profile = @grantProfile,
         updated_at = @updatedAt, version = version + 1`,
    ).run({
      id: skill.id,
      name: skill.name,
      prompt: skill.prompt,
      startUrl: skill.startUrl ?? null,
      grantProfile: skill.grantProfile ?? null,
      deviceId: MetaStore.deviceId(db),
      updatedAt: Date.now(),
    });
  }

  /** Soft-delete a skill, for the same reason hints are soft-deleted. */
  static forgetSkill(db: Db, id: string): void {
    db.prepare(
      'UPDATE agent_skills SET tombstone = 1, updated_at = ?, version = version + 1 WHERE id = ?',
    ).run(Date.now(), id);
  }
  /**
   * Grants that are live RIGHT NOW for a scope+host. Expiry is applied in the query, so an expired grant
   * is never returned even if nothing has swept it — a grant that outlives its window by however long the
   * cleanup took is exactly the silent autonomy creep this is guarded against.
   */
  static liveGrants(db: Db, scope: string, host: string, now = Date.now()): RememberedGrant[] {
    const rows = db
      .prepare(
        'SELECT * FROM agent_remembered_grants WHERE scope = ? AND host = ? AND tombstone = 0 AND expires_at > ?',
      )
      .all(scope, host, now) as GrantRow[];
    return rows.flatMap((row) => {
      const parsed = RememberedGrantSchema.safeParse({
        id: row.id,
        scope: row.scope,
        host: row.host,
        tier: row.tier,
        expiresAt: row.expires_at,
        deviceId: row.device_id,
        updatedAt: row.updated_at,
        version: row.version,
        tombstone: row.tombstone === 1,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  static putGrant(
    db: Db,
    grant: { id: string; scope: string; host: string; tier: string; expiresAt: number },
  ): void {
    db.prepare(
      `INSERT INTO agent_remembered_grants
         (id, scope, host, tier, expires_at, device_id, updated_at, version, tombstone)
       VALUES (@id, @scope, @host, @tier, @expiresAt, @deviceId, @updatedAt, 1, 0)
       ON CONFLICT(id) DO UPDATE SET expires_at = @expiresAt, updated_at = @updatedAt, version = version + 1`,
    ).run({ ...grant, deviceId: MetaStore.deviceId(db), updatedAt: Date.now() });
  }

  /**
   * Revoke every grant a scope holds. Called when the skill that owned them is deleted: the only way
   * to mint a remembered grant is a named skill, so deleting the skill must take its permissions with
   * it. A grant whose scope no longer exists would be unrevokable through any surface the user has.
   */
  static revokeGrantsForScope(db: Db, scope: string): void {
    db.prepare(
      'UPDATE agent_remembered_grants SET tombstone = 1, updated_at = ?, version = version + 1 WHERE scope = ? AND tombstone = 0',
    ).run(Date.now(), scope);
  }

  static revokeGrant(db: Db, id: string): void {
    db.prepare(
      'UPDATE agent_remembered_grants SET tombstone = 1, updated_at = ?, version = version + 1 WHERE id = ?',
    ).run(Date.now(), id);
  }
}
