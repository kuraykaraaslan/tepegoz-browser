import { createHash } from 'node:crypto';
import type { Db } from './db';

const CAS_PREFIX = 'cas://';

/**
 * Content-addressed blob store (sha256). Dedupes identical content; the journal stores only the
 * `cas://<hash>` reference, never inline base64 (avoids the transcript-bloat / token-blowup class
 * of bugs seen in competitors).
 */
export class BlobStore {
  static put(db: Db, bytes: Buffer): string {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const exists = db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(hash);
    if (exists === undefined) {
      db.prepare(
        'INSERT INTO blobs (hash, bytes, size, refcount, created_at) VALUES (?, ?, ?, 0, ?)',
      ).run(hash, bytes, bytes.length, Date.now());
    }
    return `${CAS_PREFIX}${hash}`;
  }

  static get(db: Db, ref: string): Buffer | undefined {
    const hash = ref.startsWith(CAS_PREFIX) ? ref.slice(CAS_PREFIX.length) : ref;
    const row = db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(hash) as
      { bytes: Buffer } | undefined;
    return row?.bytes;
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as { n: number };
    return row.n;
  }
}
