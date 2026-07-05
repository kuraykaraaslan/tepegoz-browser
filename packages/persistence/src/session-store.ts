import type { Db } from './db';
import { MetaStore } from './meta';

/** A persisted tab: its restorable URL plus its organizational state (pin + group membership). */
export interface PersistedTab {
  url: string;
  pinned: boolean;
  /** Owning group id (matches a `PersistedGroup.id`), or null when ungrouped. */
  groupId: string | null;
}

/** A flat, JSON-safe per-tab-group setting value (mirrors `TabGroupSettingValue` in `@tepegoz/desktop-ipc`). */
export type PersistedGroupSettingValue = string | number | boolean | null;

/** A persisted tab group. `color` is stored loosely (a string) — the model re-validates on restore.
 *  `id` is a stable UUID (unlike the pre-UUID scheme, restore reuses it rather than minting a new one),
 *  so `settings` (the per-tab-group settings standard) round-trips under the same key across restarts. */
export interface PersistedGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  settings: Record<string, PersistedGroupSettingValue>;
}

/**
 * A restorable browsing session: ordered web tabs (with pin + group membership), the group metadata,
 * and which tab was active. Versioned so the shape can evolve; `load` upconverts older snapshots.
 */
export interface SessionSnapshot {
  version: 2;
  /** Ordered web tabs to restore (internal tepegoz:// pages are not persisted). */
  tabs: PersistedTab[];
  /** Group metadata in strip order (each group has ≥1 member among `tabs`). */
  groups: PersistedGroup[];
  /** Index into `tabs` to activate on restore, or -1 when none applies (consumer clamps). */
  activeIndex: number;
}

const SESSION_KEY = 'session';

/**
 * Persisted last-session snapshot (session restore). Stored as JSON in the local `meta` table (this is
 * local-instance state, not syncable settings). `load` is defensively shape-tolerant: it upconverts a
 * legacy v1 snapshot (`{ tabs: string[]; activeIndex }`) to v2, and yields `null` for corrupt/unknown
 * values (start fresh) rather than throwing. `save` always writes the current v2 shape.
 */
export class SessionStore {
  static save(db: Db, snapshot: SessionSnapshot): void {
    MetaStore.set(db, SESSION_KEY, JSON.stringify(snapshot));
  }

  static load(db: Db): SessionSnapshot | null {
    const raw = MetaStore.get(db, SESSION_KEY);
    if (raw === undefined) return null;
    try {
      return migrateSnapshot(JSON.parse(raw));
    } catch {
      return null; // malformed JSON → start fresh
    }
  }

  static clear(db: Db): void {
    SessionStore.save(db, { version: 2, tabs: [], groups: [], activeIndex: -1 });
  }
}

/** Upconvert any stored value to the current v2 shape, or null if it isn't a recognizable snapshot. */
export function migrateSnapshot(value: unknown): SessionSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.activeIndex !== 'number' || !Array.isArray(o.tabs)) return null;

  // Legacy v1: `tabs` is a plain string[] and there's no `version`.
  if (o.version === undefined) {
    if (!o.tabs.every((t) => typeof t === 'string')) return null;
    return {
      version: 2,
      tabs: o.tabs.map((url) => ({ url: String(url), pinned: false, groupId: null })),
      groups: [],
      activeIndex: o.activeIndex,
    };
  }

  // v2.
  if (o.version === 2) {
    const tabs = parseTabs(o.tabs);
    const groups = parseGroups(o.groups);
    if (tabs === null || groups === null) return null;
    return { version: 2, tabs, groups, activeIndex: o.activeIndex };
  }

  return null; // unknown future version → start fresh rather than misread
}

function parseTabs(raw: unknown[]): PersistedTab[] | null {
  const out: PersistedTab[] = [];
  for (const t of raw) {
    if (typeof t !== 'object' || t === null) return null;
    const o = t as Record<string, unknown>;
    if (typeof o.url !== 'string') return null;
    out.push({
      url: o.url,
      pinned: o.pinned === true,
      groupId: typeof o.groupId === 'string' ? o.groupId : null,
    });
  }
  return out;
}

function parseGroups(raw: unknown): PersistedGroup[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PersistedGroup[] = [];
  for (const g of raw) {
    if (typeof g !== 'object' || g === null) return null;
    const o = g as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.color !== 'string') return null;
    out.push({
      id: o.id,
      name: typeof o.name === 'string' ? o.name : '',
      color: o.color,
      collapsed: o.collapsed === true,
      settings: parseSettings(o.settings),
    });
  }
  return out;
}

/** Tolerantly default a persisted group's settings bag to `{}` unless it's already a flat, JSON-safe
 *  record — never throws (corrupt/legacy snapshots just start that group with no settings). */
function parseSettings(raw: unknown): Record<string, PersistedGroupSettingValue> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PersistedGroupSettingValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    }
  }
  return out;
}
