import type { HistoryEntry } from './history-store';

/**
 * Serialize browsing history to CSV for a user-initiated export.
 *
 * CSV, not a JSON dump: `data-and-backup.md`'s standing rule is that a backup only this app can read
 * is "lock-in shaped". There is no portable history *interchange* format the way bookmarks have
 * Netscape HTML, so the goal here is inspection and archival — a spreadsheet anyone can open — not
 * re-import (no history import exists). Columns: `url,title,last_visited,visit_count`, with
 * `last_visited` an ISO-8601 UTC timestamp so it sorts and parses everywhere.
 *
 * RFC 4180 quoting: a field is wrapped in `"` when it contains a comma, a quote, CR or LF, and inner
 * quotes are doubled. A leading `=`/`+`/`-`/`@` (spreadsheet formula-injection vector — a page title
 * is attacker-controlled) is prefixed with a `'` so Excel/Sheets treat it as text.
 */
const HISTORY_CSV_HEADER = 'url,title,last_visited,visit_count';

function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function serializeHistoryCsv(rows: readonly Omit<HistoryEntry, 'favicon'>[]): string {
  const lines = [HISTORY_CSV_HEADER];
  for (const row of rows) {
    const lastVisited = Number.isFinite(row.ts) ? new Date(row.ts).toISOString() : '';
    lines.push(
      [
        csvField(row.url),
        csvField(row.title),
        csvField(lastVisited),
        String(row.visitCount),
      ].join(','),
    );
  }
  // Trailing newline — most CSV readers and POSIX tools expect a final line terminator.
  return `${lines.join('\r\n')}\r\n`;
}
