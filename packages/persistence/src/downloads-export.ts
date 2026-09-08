import type { DownloadExportRow } from './download-store';
import { csvField } from './csv';

/**
 * Serialize the downloads list to CSV for a user-initiated export.
 *
 * CSV, not a JSON dump: `data-and-backup.md`'s standing rule is that a backup only this app can read
 * is "lock-in shaped". There is no portable downloads *interchange* format, so this is for
 * inspection and archival — a spreadsheet anyone can open — and there is no downloads *import*.
 *
 * Columns: `filename,url,source_origin,total_bytes,status,risk,created_at,completed_at`. `created_at`
 * and `completed_at` are ISO-8601 UTC timestamps so they sort and parse everywhere; `total_bytes` is
 * left blank when the server never declared a size, and `completed_at` when the transfer never
 * finished. Same RFC-4180 quoting and formula-injection guard as the history exporter ({@link
 * csvField}).
 */
const DOWNLOADS_CSV_HEADER =
  'filename,url,source_origin,total_bytes,status,risk,created_at,completed_at';

function isoOrBlank(ts: number | null): string {
  return ts !== null && Number.isFinite(ts) ? new Date(ts).toISOString() : '';
}

export function serializeDownloadsCsv(rows: readonly DownloadExportRow[]): string {
  const lines = [DOWNLOADS_CSV_HEADER];
  for (const row of rows) {
    lines.push(
      [
        csvField(row.filename),
        csvField(row.url),
        csvField(row.sourceOrigin),
        row.totalBytes === null ? '' : String(row.totalBytes),
        csvField(row.status),
        csvField(row.risk),
        csvField(isoOrBlank(row.createdAt)),
        csvField(isoOrBlank(row.completedAt)),
      ].join(','),
    );
  }
  // Trailing newline — most CSV readers and POSIX tools expect a final line terminator.
  return `${lines.join('\r\n')}\r\n`;
}
