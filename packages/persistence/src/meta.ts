import { randomUUID } from 'node:crypto';
import type { Db } from './db';

/** Local-instance metadata (device id, schema info, …). */
export class MetaStore {
  static get(db: Db, key: string): string | undefined {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value;
  }

  static set(db: Db, key: string, value: string): void {
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value);
  }

  /** Stable per-install device id (generated once) — the Event Journal's sync key. */
  static deviceId(db: Db): string {
    const existing = MetaStore.get(db, 'device_id');
    if (existing !== undefined) return existing;
    const id = randomUUID();
    MetaStore.set(db, 'device_id', id);
    return id;
  }
}
