import {
  EventSchema,
  EventInputSchema,
  type EventRecord,
  type EventInput,
} from '@tepegoz/shared-types';
import type { Db } from './db';
import { MetaStore } from './meta';

interface EventRow {
  lsn: number;
  id: string;
  type: string;
  ts: number;
  actor: string;
  correlation_id: string;
  payload: string;
  blob_ref: string | null;
  redacted: number;
  device_id: string;
  prev_hash: string | null;
  self_hash: string | null;
}

function rowToEvent(row: EventRow): EventRecord {
  const base = {
    lsn: row.lsn,
    id: row.id,
    type: row.type,
    ts: row.ts,
    actor: row.actor,
    correlationId: row.correlation_id,
    payload: JSON.parse(row.payload) as unknown,
    redacted: row.redacted === 1,
    deviceId: row.device_id,
  };
  // Re-validate on the way out (the journal is the contract boundary).
  return EventSchema.parse({
    ...base,
    ...(row.blob_ref !== null ? { blobRef: row.blob_ref } : {}),
    ...(row.prev_hash !== null ? { prevHash: row.prev_hash } : {}),
    ...(row.self_hash !== null ? { selfHash: row.self_hash } : {}),
  });
}

/**
 * Append-only Event Journal (L1). Events are immutable facts — never updated or deleted. All
 * state/observability/audit/replay derives from these. `lsn` is a monotonic SQLite autoincrement;
 * `deviceId` is stamped from local meta (the journal's sync key).
 */
export class EventJournal {
  static append(db: Db, input: EventInput): EventRecord {
    const e = EventInputSchema.parse(input);
    const deviceId = MetaStore.deviceId(db);
    const info = db
      .prepare(
        `INSERT INTO events (
           id, type, ts, actor, correlation_id, payload, blob_ref, redacted, device_id,
           prev_hash, self_hash
         )
         VALUES (
           @id, @type, @ts, @actor, @correlationId, @payload, @blobRef, @redacted, @deviceId,
           @prevHash, @selfHash
         )`,
      )
      .run({
        id: e.id,
        type: e.type,
        ts: e.ts,
        actor: e.actor,
        correlationId: e.correlationId,
        payload: JSON.stringify(e.payload ?? null),
        blobRef: e.blobRef ?? null,
        redacted: e.redacted ? 1 : 0,
        deviceId,
        // Neither computed nor required here — see the migration's note. A caller chaining this append
        // (persistence must not depend on @tepegoz/notary) supplies both already folded, or neither.
        prevHash: e.prevHash ?? null,
        selfHash: e.selfHash ?? null,
      });
    return EventSchema.parse({ ...e, lsn: Number(info.lastInsertRowid), deviceId });
  }

  /**
   * The most recent HASHED event's `selfHash` — the value a caller chaining the NEXT append must supply
   * as that event's `prevHash`. Null when no event in this journal has been chained yet (either this
   * device pre-dates chain wiring, or every row so far was appended without hash fields) — a caller sees
   * null and knows to start from `@tepegoz/notary`'s own `GENESIS_HASH`, which this package does not
   * import or know about.
   */
  static tailHash(db: Db): string | null {
    const row = db
      .prepare('SELECT self_hash FROM events WHERE self_hash IS NOT NULL ORDER BY lsn DESC LIMIT 1')
      .get() as { self_hash: string } | undefined;
    return row?.self_hash ?? null;
  }

  /** Read all events with lsn strictly greater than `fromLsn`, in order. */
  static readFrom(db: Db, fromLsn: number): EventRecord[] {
    const rows = db
      .prepare('SELECT * FROM events WHERE lsn > ? ORDER BY lsn ASC')
      .all(fromLsn) as EventRow[];
    return rows.map(rowToEvent);
  }

  /**
   * Read the most recent `limit` events (newest first), optionally scoped to one `correlationId`
   * (a single task/run). Backs the `journal_query_events` agent tool + the Console timeline replay.
   */
  static readRecent(db: Db, limit: number, correlationId?: string): EventRecord[] {
    const n = Math.max(0, Math.min(Math.trunc(limit), 1000));
    if (n === 0) return [];
    const rows =
      correlationId === undefined
        ? (db.prepare('SELECT * FROM events ORDER BY lsn DESC LIMIT ?').all(n) as EventRow[])
        : (db
            .prepare('SELECT * FROM events WHERE correlation_id = ? ORDER BY lsn DESC LIMIT ?')
            .all(correlationId, n) as EventRow[]);
    return rows.map(rowToEvent);
  }

  /**
   * Read the most recent `limit` events of any of the given `types` (newest first), across every
   * correlation id. Backs the Permission Debug view (S8 PR7): a per-decision journal record is
   * correlated to a RUN, not a site, so finding "every decision on example.com" has to scan by type
   * and filter by the payload's site in the caller — this is the type-scoped read that makes that
   * affordable without adding a payload-shaped SQL column for one read-only debug surface.
   */
  static readByTypes(db: Db, types: readonly string[], limit: number): EventRecord[] {
    const n = Math.max(0, Math.min(Math.trunc(limit), 1000));
    if (n === 0 || types.length === 0) return [];
    const placeholders = types.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM events WHERE type IN (${placeholders}) ORDER BY lsn DESC LIMIT ?`)
      .all(...types, n) as EventRow[];
    return rows.map(rowToEvent);
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
    return row.n;
  }
}
