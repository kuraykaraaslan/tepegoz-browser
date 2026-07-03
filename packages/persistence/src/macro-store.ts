import type { Macro } from '@tepegoz/shared-types';
import type { Db } from './db';

/** A saved macro's metadata (list view — the full IR is fetched per-item via {@link MacroStore.get}). */
export interface MacroSummary {
  id: string;
  name: string;
  stepCount: number;
  updatedAt: number;
}

interface MacroRow {
  id: string;
  name: string;
  ir: string;
  updated_at: number;
}

/**
 * Saved macros (L1). One row per macro; the deterministic IR is stored as JSON in `ir`. Reads are
 * trusted DB output (the IR was validated by `MacroSchema` at the IPC boundary before it was written);
 * callers re-validate on load if they want belt-and-suspenders. Mirrors `BookmarkStore`/`HistoryStore`.
 */
export class MacroStore {
  /** Insert or replace a macro (upsert on id). Returns the stored id. */
  static save(db: Db, macro: Macro, now: number): string {
    db.prepare(
      `INSERT INTO macros (id, name, ir, created_at, updated_at)
       VALUES (@id, @name, @ir, @now, @now)
       ON CONFLICT(id) DO UPDATE SET name = @name, ir = @ir, updated_at = @now`,
    ).run({ id: macro.id, name: macro.name, ir: JSON.stringify(macro), now });
    return macro.id;
  }

  /** Newest-first summaries for the "My Macros" list. */
  static list(db: Db, limit = 500): MacroSummary[] {
    const rows = db
      .prepare('SELECT id, name, ir, updated_at FROM macros ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as MacroRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      stepCount: stepCountOf(r.ir),
      updatedAt: r.updated_at,
    }));
  }

  /** The full IR for one macro, or null. Parsing failure (corrupt row) returns null, not a throw. */
  static get(db: Db, id: string): Macro | null {
    const row = db.prepare('SELECT ir FROM macros WHERE id = ?').get(id) as
      | { ir: string }
      | undefined;
    if (row === undefined) return null;
    try {
      return JSON.parse(row.ir) as Macro;
    } catch {
      return null;
    }
  }

  static delete(db: Db, id: string): void {
    db.prepare('DELETE FROM macros WHERE id = ?').run(id);
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM macros').get() as { n: number };
    return row.n;
  }
}

/** Best-effort top-level step count for a summary (0 if the stored IR can't be parsed). */
function stepCountOf(ir: string): number {
  try {
    const parsed = JSON.parse(ir) as { steps?: unknown };
    return Array.isArray(parsed.steps) ? parsed.steps.length : 0;
  } catch {
    return 0;
  }
}
