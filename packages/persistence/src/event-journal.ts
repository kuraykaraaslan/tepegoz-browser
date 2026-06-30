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
  return EventSchema.parse(row.blob_ref !== null ? { ...base, blobRef: row.blob_ref } : base);
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
        `INSERT INTO events (id, type, ts, actor, correlation_id, payload, blob_ref, redacted, device_id)
         VALUES (@id, @type, @ts, @actor, @correlationId, @payload, @blobRef, @redacted, @deviceId)`,
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
      });
    return EventSchema.parse({ ...e, lsn: Number(info.lastInsertRowid), deviceId });
  }

  /** Read all events with lsn strictly greater than `fromLsn`, in order. */
  static readFrom(db: Db, fromLsn: number): EventRecord[] {
    const rows = db
      .prepare('SELECT * FROM events WHERE lsn > ? ORDER BY lsn ASC')
      .all(fromLsn) as EventRow[];
    return rows.map(rowToEvent);
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
    return row.n;
  }
}
