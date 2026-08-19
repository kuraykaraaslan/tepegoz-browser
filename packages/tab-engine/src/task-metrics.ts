/**
 * Per-tab resource accounting for the Task Manager (Phase 2b).
 *
 * Electron hands out `app.getAppMetrics()` keyed by **process**, and the browser thinks in **tabs**.
 * Mapping one onto the other is the whole job, and it is not one-to-one: Chromium groups same-site tabs
 * into a shared renderer process, so several tabs can share a PID.
 *
 * That sharing is why this reports honestly rather than neatly. A Task Manager that silently attributes
 * a shared process's whole 400 MB to each of four tabs is not a diagnostic tool — it is four wrong
 * numbers. Each row says whether its figures are `shared`, and a shared row's memory is the *process
 * total*, flagged as such, not a per-tab fiction invented by division.
 *
 * Pure: takes metrics and a tab→PID map, returns rows. No Electron import, so it is testable.
 */

export interface ProcessMetric {
  pid: number;
  /** Percent of one CPU, as Electron reports it. */
  cpuPercent: number;
  /** Working-set size in KILOBYTES, as Electron reports it. */
  workingSetKb: number;
  type: string;
}

export interface TabProcess {
  tabId: string;
  title: string;
  url: string;
  pid: number;
  /** A discarded (slept) tab has no live process; its row still appears, with no figures. */
  discarded?: boolean;
}

export interface TaskManagerRow {
  tabId: string;
  title: string;
  url: string;
  pid: number | null;
  cpuPercent: number | null;
  memoryMb: number | null;
  /** True when other tabs share this process — the figures are the PROCESS total, not this tab's share. */
  shared: boolean;
  /** How many tabs (including this one) live in that process. */
  tabsInProcess: number;
  discarded: boolean;
}

const KB_PER_MB = 1024;

/**
 * Build the Task Manager rows.
 *
 * A tab whose process is not in the metrics list gets `null` figures rather than zeros. Zero is a
 * measurement; "we could not see it" is not, and printing the second as the first is how a diagnostic
 * tool starts lying about the thing it exists to show.
 */
export function taskManagerRows(
  tabs: readonly TabProcess[],
  metrics: readonly ProcessMetric[],
): TaskManagerRow[] {
  const byPid = new Map(metrics.map((m) => [m.pid, m]));
  const tabsPerPid = new Map<number, number>();
  for (const t of tabs) {
    if (t.discarded === true) continue;
    tabsPerPid.set(t.pid, (tabsPerPid.get(t.pid) ?? 0) + 1);
  }

  return tabs.map((t) => {
    const discarded = t.discarded === true;
    const metric = discarded ? undefined : byPid.get(t.pid);
    const tabsInProcess = discarded ? 0 : (tabsPerPid.get(t.pid) ?? 0);
    return {
      tabId: t.tabId,
      title: t.title,
      url: t.url,
      pid: discarded ? null : t.pid,
      cpuPercent: metric === undefined ? null : round1(metric.cpuPercent),
      memoryMb: metric === undefined ? null : round1(metric.workingSetKb / KB_PER_MB),
      shared: tabsInProcess > 1,
      tabsInProcess,
      discarded,
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Total memory across the DISTINCT processes backing these tabs.
 *
 * Summing the rows would double-count every shared process, which is exactly the mistake the `shared`
 * flag exists to prevent — so the total is computed from processes, not from rows.
 */
export function totalMemoryMb(rows: readonly TaskManagerRow[]): number {
  const seen = new Set<number>();
  let total = 0;
  for (const r of rows) {
    if (r.pid === null || r.memoryMb === null || seen.has(r.pid)) continue;
    seen.add(r.pid);
    total += r.memoryMb;
  }
  return round1(total);
}
