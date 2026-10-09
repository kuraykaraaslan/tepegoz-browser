import { type ClosedTab } from '@tepegoz/desktop-ipc';

/**
 * Recently-closed web tabs (LIFO, newest last) backing both reopen-closed-tab (Ctrl+Shift+T) and the
 * History menu's "Recently closed" section. In-memory, session-scoped and shared across all windows —
 * Chrome's session-wide reopen stack.
 *
 * It carries the title as well as the URL because a list the user PICKS from has to be readable, and a
 * closed tab's title cannot be recovered afterwards: the webContents that knew it is gone.
 *
 * **Group-aware (ADR-0020):** closing a whole group is one outcome, so the tabs it closes share a
 * `batch` and carry the group's name and colour. The list shows the batch as one row and reopening it
 * restores the tabs as a group. Group identity is a UI/binding property only — no policy scope travels
 * with it.
 */
export interface ClosedGroupMeta {
  name: string;
  color: string;
}

interface ClosedEntry extends ClosedTab {
  /** Set when the tab was closed as part of "Close group"; entries sharing it restore together. */
  batch?: string;
  groupMeta?: ClosedGroupMeta;
}

export const closedTabs: ClosedEntry[] = [];

/** How many closed tabs are remembered. Beyond this the oldest is dropped. */
const CLOSED_TAB_LIMIT = 25;

let closedSeq = 0;
let batchSeq = 0;
let activeBatch: string | null = null;

/** Run `fn` with every tab it closes recorded as ONE restorable batch (used by "Close group"). */
export function runAsClosedBatch(fn: () => void): void {
  const outer = activeBatch;
  batchSeq += 1;
  activeBatch = `cb-${String(batchSeq)}`;
  try {
    fn();
  } finally {
    activeBatch = outer;
  }
}

/** Record a closed tab at the top of the list, evicting the oldest past the cap. The synthetic id is
 *  monotonic per run, so a menu row can name an entry that stays the same as newer ones arrive. */
export function rememberClosedTab(
  url: string,
  title: string,
  closedAt: number,
  group?: ClosedGroupMeta,
): void {
  closedSeq += 1;
  const entry: ClosedEntry = { id: `rc-${String(closedSeq)}`, url, title, closedAt };
  if (activeBatch !== null && group !== undefined) {
    entry.batch = activeBatch;
    entry.groupMeta = group;
  }
  closedTabs.push(entry);
  if (closedTabs.length > CLOSED_TAB_LIMIT) closedTabs.shift();
}

/** Take a closed tab out of the list: the named entry, or the most recent one when `id` is omitted.
 *  Removing it on take is what stops one entry from being reopened twice from a stale menu. */
export function takeClosedTab(id?: string): ClosedTab | undefined {
  if (id === undefined) return closedTabs.pop();
  const at = closedTabs.findIndex((t) => t.id === id);
  return at === -1 ? undefined : closedTabs.splice(at, 1)[0];
}

/**
 * Take the named entry (or the newest) AND, when it was closed as part of a group, every other tab of
 * that same batch — in the order they were closed. `group` is set only for a real batch.
 */
export function takeClosedBatch(id?: string): { tabs: ClosedTab[]; group?: ClosedGroupMeta } {
  const first = takeClosedTab(id) as ClosedEntry | undefined;
  if (first === undefined) return { tabs: [] };
  if (first.batch === undefined || first.groupMeta === undefined) return { tabs: [first] };
  const batch = first.batch;
  const mates = closedTabs.filter((t) => t.batch === batch);
  for (const m of mates) closedTabs.splice(closedTabs.indexOf(m), 1);
  return { tabs: [...mates, first], group: first.groupMeta };
}

/** The list newest-first, as the renderer reads it. A group batch collapses into one row. */
export function recentlyClosedTabs(): ClosedTab[] {
  const rows: ClosedTab[] = [];
  const seen = new Set<string>();
  for (const t of [...closedTabs].reverse()) {
    if (t.batch === undefined || t.groupMeta === undefined) {
      rows.push({ id: t.id, url: t.url, title: t.title, closedAt: t.closedAt });
      continue;
    }
    if (seen.has(t.batch)) continue;
    seen.add(t.batch);
    const count = closedTabs.filter((m) => m.batch === t.batch).length;
    rows.push({
      id: t.id,
      url: t.url,
      title: t.title,
      closedAt: t.closedAt,
      group: { name: t.groupMeta.name, color: t.groupMeta.color, count },
    });
  }
  return rows;
}
