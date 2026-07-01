import type { Db } from './db';
import { MetaStore } from './meta';

/** A restorable browsing session: the ordered web-tab URLs and which one was active. */
export interface SessionSnapshot {
  /** Ordered web-tab URLs to restore (internal tepegoz:// pages are not persisted). */
  tabs: string[];
  /** Index into `tabs` to activate on restore, or -1 when none applies (consumer clamps). */
  activeIndex: number;
}

const SESSION_KEY = 'session';

/**
 * Persisted last-session snapshot (L0 session restore). Stored as JSON in the local `meta` table (this
 * is local-instance state, not syncable settings). `load` defensively validates the shape — a corrupt
 * or partial value yields `null` (start fresh) rather than throwing.
 */
export class SessionStore {
  static save(db: Db, snapshot: SessionSnapshot): void {
    MetaStore.set(db, SESSION_KEY, JSON.stringify(snapshot));
  }

  static load(db: Db): SessionSnapshot | null {
    const raw = MetaStore.get(db, SESSION_KEY);
    if (raw === undefined) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? { tabs: parsed.tabs, activeIndex: parsed.activeIndex } : null;
    } catch {
      return null; // malformed JSON → start fresh
    }
  }

  static clear(db: Db): void {
    SessionStore.save(db, { tabs: [], activeIndex: -1 });
  }
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.tabs) &&
    o.tabs.every((t) => typeof t === 'string') &&
    typeof o.activeIndex === 'number'
  );
}
