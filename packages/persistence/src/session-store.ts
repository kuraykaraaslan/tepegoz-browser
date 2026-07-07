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

/** A browser window's position + size (screen DIP), so restore reopens each window where it was. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One window's restorable tabs: ordered web tabs (with pin + group membership), group metadata, the
 *  active tab, and the window's on-screen bounds. */
export interface WindowSnapshot {
  /** Ordered web tabs to restore (internal tepegoz:// pages are not persisted). */
  tabs: PersistedTab[];
  /** Group metadata in strip order (each group has ≥1 member among `tabs`). */
  groups: PersistedGroup[];
  /** Index into `tabs` to activate on restore, or -1 when none applies (consumer clamps). */
  activeIndex: number;
  /** Window position/size to restore; absent for legacy (single-window) snapshots. */
  bounds?: WindowBounds;
}

/**
 * A restorable browsing session across ALL open windows (multi-window, ADR tab tear-off). Versioned so
 * the shape can evolve; `load` upconverts older single-window snapshots (v1/v2) into a one-entry
 * `windows` array.
 */
export interface SessionSnapshot {
  version: 3;
  /** Each open window's tabs, in the order windows were opened. */
  windows: WindowSnapshot[];
}

const SESSION_KEY = 'session';

/**
 * Persisted last-session snapshot (session restore). Stored as JSON in the local `meta` table (this is
 * local-instance state, not syncable settings). `load` is defensively shape-tolerant: it upconverts a
 * legacy v1 snapshot (`{ tabs: string[]; activeIndex }`) and a single-window v2 snapshot into the current
 * multi-window v3 shape, and yields `null` for corrupt/unknown values (start fresh) rather than throwing.
 * `save` always writes the current v3 shape.
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
    SessionStore.save(db, { version: 3, windows: [] });
  }
}

/** Upconvert any stored value to the current v3 shape, or null if it isn't a recognizable snapshot. */
export function migrateSnapshot(value: unknown): SessionSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (o.version === 3) return migrateV3(o.windows); // current multi-window shape
  if (o.version === 2) {
    // v2 — a single window's tabs/groups/activeIndex at the top level → wrap as one window.
    const w = parseWindow(o);
    return w === null ? null : { version: 3, windows: [w] };
  }
  if (o.version === undefined) return migrateV1(o); // legacy string[] tabs
  return null; // unknown future version → start fresh rather than misread
}

/** Parse a v3 `windows` array; null if it (or any window) is malformed. */
function migrateV3(windows: unknown): SessionSnapshot | null {
  if (!Array.isArray(windows)) return null;
  const out: WindowSnapshot[] = [];
  for (const w of windows) {
    const parsed = parseWindow(w);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return { version: 3, windows: out };
}

/** Upconvert a legacy v1 snapshot (`{ tabs: string[]; activeIndex }`) to a one-window v3 snapshot. */
function migrateV1(o: Record<string, unknown>): SessionSnapshot | null {
  if (typeof o.activeIndex !== 'number' || !Array.isArray(o.tabs)) return null;
  if (!o.tabs.every((t) => typeof t === 'string')) return null;
  return {
    version: 3,
    windows: [
      {
        tabs: o.tabs.map((url) => ({ url: String(url), pinned: false, groupId: null })),
        groups: [],
        activeIndex: o.activeIndex,
      },
    ],
  };
}

/** Parse one window's snapshot (also the v2 top-level shape). Null when the shape is unrecognizable. */
function parseWindow(value: unknown): WindowSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.activeIndex !== 'number' || !Array.isArray(o.tabs)) return null;
  const tabs = parseTabs(o.tabs);
  const groups = parseGroups(o.groups);
  if (tabs === null || groups === null) return null;
  const window: WindowSnapshot = { tabs, groups, activeIndex: o.activeIndex };
  const bounds = parseBounds(o.bounds);
  if (bounds !== null) window.bounds = bounds;
  return window;
}

/** Tolerantly parse a window's bounds; null (omit) unless all four numeric fields are present. */
function parseBounds(raw: unknown): WindowBounds | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.x !== 'number' ||
    typeof o.y !== 'number' ||
    typeof o.width !== 'number' ||
    typeof o.height !== 'number'
  ) {
    return null;
  }
  return { x: o.x, y: o.y, width: o.width, height: o.height };
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
