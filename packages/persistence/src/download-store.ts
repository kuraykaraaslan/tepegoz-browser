import type { DownloadRecord } from '@tepegoz/downloads';
import type { Db } from './db';

export interface PersistedDownload extends DownloadRecord {
  quarantinePath?: string | undefined;
  finalPath?: string | undefined;
  /**
   * What a resume across an app restart needs (migration 19). Main-process only — `publicRecord`
   * does not project them, because a URL chain can carry a signed query and the renderer has no use
   * for any of it.
   */
  urlChain?: string[] | undefined;
  etag?: string | undefined;
  lastModified?: string | undefined;
  /** The browsing partition the transfer was on — a resume must not move it to another route. */
  partition?: string | undefined;
}

interface DownloadRow {
  id: string;
  url: string;
  filename: string;
  mime_type: string | null;
  status: DownloadRecord['status'];
  risk: DownloadRecord['risk'];
  trust_verdict: DownloadRecord['trustVerdict'];
  received_bytes: number;
  total_bytes: number | null;
  can_resume: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  error: string | null;
  sha256: string | null;
  actor: DownloadRecord['provenance']['actor'];
  source_url: string | null;
  source_origin: string | null;
  correlation_id: string | null;
  task_id: string | null;
  quarantine_path: string | null;
  url_chain: string | null;
  etag: string | null;
  last_modified: string | null;
  partition: string | null;
  final_path: string | null;
}

function rowToDownload(row: DownloadRow): PersistedDownload {
  const record: PersistedDownload = {
    id: row.id,
    url: row.url,
    filename: row.filename,
    ...(row.mime_type !== null ? { mimeType: row.mime_type } : {}),
    status: row.status,
    risk: row.risk,
    trustVerdict: row.trust_verdict,
    receivedBytes: row.received_bytes,
    totalBytes: row.total_bytes,
    canResume: row.can_resume === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    ...(row.sha256 !== null ? { sha256: row.sha256 } : {}),
    provenance: {
      actor: row.actor,
      ...(row.source_url !== null ? { sourceUrl: row.source_url } : {}),
      ...(row.source_origin !== null ? { sourceOrigin: row.source_origin } : {}),
      ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
      ...(row.task_id !== null ? { taskId: row.task_id } : {}),
    },
    ...(row.quarantine_path !== null ? { quarantinePath: row.quarantine_path } : {}),
    ...(row.final_path !== null ? { finalPath: row.final_path } : {}),
    // A chain that cannot be parsed is dropped rather than guessed at: a resume without the real
    // redirect chain would ask the wrong server for a byte range.
    ...(row.url_chain !== null ? { urlChain: parseUrlChain(row.url_chain) } : {}),
    ...(row.etag !== null ? { etag: row.etag } : {}),
    ...(row.last_modified !== null ? { lastModified: row.last_modified } : {}),
    ...(row.partition !== null ? { partition: row.partition } : {}),
  };
  return record;
}

function parseUrlChain(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toParams(record: PersistedDownload): Record<string, unknown> {
  return {
    id: record.id,
    url: record.url,
    filename: record.filename,
    mimeType: record.mimeType ?? null,
    status: record.status,
    risk: record.risk,
    trustVerdict: record.trustVerdict,
    receivedBytes: record.receivedBytes,
    totalBytes: record.totalBytes,
    canResume: record.canResume ? 1 : 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? null,
    error: record.error ?? null,
    sha256: record.sha256 ?? null,
    actor: record.provenance.actor,
    sourceUrl: record.provenance.sourceUrl ?? null,
    sourceOrigin: record.provenance.sourceOrigin ?? null,
    urlChain: record.urlChain === undefined ? null : JSON.stringify(record.urlChain),
    etag: record.etag ?? null,
    lastModified: record.lastModified ?? null,
    partition: record.partition ?? null,
    correlationId: record.provenance.correlationId ?? null,
    taskId: record.provenance.taskId ?? null,
    quarantinePath: record.quarantinePath ?? null,
    finalPath: record.finalPath ?? null,
  };
}

export class DownloadStore {
  static list(db: Db, limit = 500): PersistedDownload[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 1000));
    const rows = db
      .prepare('SELECT * FROM downloads ORDER BY updated_at DESC LIMIT ?')
      .all(n) as DownloadRow[];
    return rows.map(rowToDownload);
  }

  static upsert(db: Db, record: PersistedDownload): void {
    db.prepare(
      `INSERT INTO downloads (
        id, url, filename, mime_type, status, risk, trust_verdict, received_bytes, total_bytes,
        can_resume, created_at, updated_at, completed_at, error, sha256, actor, source_url,
        source_origin, correlation_id, task_id, quarantine_path, final_path,
        url_chain, etag, last_modified, partition
      ) VALUES (
        @id, @url, @filename, @mimeType, @status, @risk, @trustVerdict, @receivedBytes, @totalBytes,
        @canResume, @createdAt, @updatedAt, @completedAt, @error, @sha256, @actor, @sourceUrl,
        @sourceOrigin, @correlationId, @taskId, @quarantinePath, @finalPath,
        @urlChain, @etag, @lastModified, @partition
      )
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        filename = excluded.filename,
        mime_type = excluded.mime_type,
        status = excluded.status,
        risk = excluded.risk,
        trust_verdict = excluded.trust_verdict,
        received_bytes = excluded.received_bytes,
        total_bytes = excluded.total_bytes,
        can_resume = excluded.can_resume,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        error = excluded.error,
        sha256 = excluded.sha256,
        actor = excluded.actor,
        source_url = excluded.source_url,
        source_origin = excluded.source_origin,
        correlation_id = excluded.correlation_id,
        task_id = excluded.task_id,
        quarantine_path = excluded.quarantine_path,
        url_chain = excluded.url_chain,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        partition = excluded.partition,
        final_path = excluded.final_path`,
    ).run(toParams(record));
  }

  static remove(db: Db, id: string): void {
    db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
  }

  static clearTerminal(db: Db): void {
    db.prepare(
      "DELETE FROM downloads WHERE status IN ('completed', 'blocked', 'canceled', 'failed')",
    ).run();
  }

  /**
   * The time-ranged clear. Terminal rows only, for the same reason `clearTerminal` is: a download still
   * running is not history yet, and removing its row would leave a transfer nothing is tracking.
   *
   * Ranged on `created_at` rather than `updated_at`: a download BELONGS to the moment it was started,
   * which is what a user picking "last hour" is thinking of. `updated_at` moves with every progress
   * write, so a long transfer started yesterday would be swept up by an hour-long range.
   */
  static clearTerminalSince(db: Db, cutoff: number): number {
    return db
      .prepare(
        `DELETE FROM downloads
         WHERE status IN ('completed', 'blocked', 'canceled', 'failed') AND created_at >= ?`,
      )
      .run(cutoff).changes;
  }
}
