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
