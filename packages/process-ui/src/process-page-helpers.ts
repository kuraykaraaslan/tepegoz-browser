import type { ProcessRow } from '@tepegoz/desktop-ipc';

/** Binary-prefix byte formatter (KiB/MiB/GiB), one decimal past KB. Locale-neutral digits. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(Math.max(0, Math.round(bytes)))} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** CPU percent for display — one decimal, never negative. */
export function formatCpu(percent: number): string {
  return `${Math.max(0, percent).toFixed(1)}%`;
}

const KIND_ORDER: Record<ProcessRow['kind'], number> = { browser: 0, gpu: 1, utility: 2, tab: 3 };

/**
 * Stable display order: browser → GPU → utility → live tabs → sleeping tabs, each group heaviest
 * first. A stable order matters because the page re-polls every second — rows jumping around on every
 * refresh would make it unreadable.
 */
export function sortRows(rows: readonly ProcessRow[]): ProcessRow[] {
  return [...rows].sort((a, b) => {
    const aSleeping = a.discarded === true;
    const bSleeping = b.discarded === true;
    if (aSleeping !== bSleeping) return aSleeping ? 1 : -1;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (b.memoryBytes !== a.memoryBytes) return b.memoryBytes - a.memoryBytes;
    return a.label.localeCompare(b.label);
  });
}

/** The columns the user can click to sort by. `task` sorts on the row label. */
export const SORT_KEYS = ['task', 'cpu', 'memory', 'pid'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/**
 * First-click direction per column: names read best ascending (A→Z), the resource counters best
 * descending (heaviest / newest first) — same as Chrome's task manager.
 */
export const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  task: 'asc',
  cpu: 'desc',
  memory: 'desc',
  pid: 'asc',
};

const SORT_COMPARATORS: Record<SortKey, (a: ProcessRow, b: ProcessRow) => number> = {
  task: (a, b) => a.label.localeCompare(b.label),
  cpu: (a, b) => a.cpuPercent - b.cpuPercent,
  memory: (a, b) => a.memoryBytes - b.memoryBytes,
  pid: (a, b) => a.pid - b.pid,
};

/**
 * Presentational, user-driven column sort. Pure and stable: rows whose key compares equal keep their
 * incoming order (explicit index tie-break, not a reliance on the engine's stability), and the input
 * array is never mutated — the page re-runs this from the current sort state on every poll refresh so
 * the chosen order survives new data.
 */
export function sortRowsByColumn(
  rows: readonly ProcessRow[],
  key: SortKey,
  direction: SortDirection,
): ProcessRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = SORT_COMPARATORS[key];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byKey = compare(a.row, b.row) * sign;
      return byKey !== 0 ? byKey : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Column sums for the footer "Total" row. */
export function totals(rows: readonly ProcessRow[]): { cpuPercent: number; memoryBytes: number } {
  return rows.reduce(
    (acc, r) => ({
      cpuPercent: acc.cpuPercent + Math.max(0, r.cpuPercent),
      memoryBytes: acc.memoryBytes + Math.max(0, r.memoryBytes),
    }),
    { cpuPercent: 0, memoryBytes: 0 },
  );
}
