/** One audit event as exposed to the agent — a compact, already-redacted projection. */
export interface JournalEntry {
  type: string;
  ts: number;
  actor: string;
  correlationId: string;
  summary: string;
}

/**
 * Read seam over the append-only Event Journal, injected so the `journal_*` agent tool stays Electron-
 * and persistence-free. The desktop app implements it over `EventJournal` + the SQLite db.
 */
export interface JournalReader {
  /** Most recent events (newest first), optionally scoped to one run/correlationId. */
  recentEvents(limit: number, correlationId?: string): JournalEntry[];
}
