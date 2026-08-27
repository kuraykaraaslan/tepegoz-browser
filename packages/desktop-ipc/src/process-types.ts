/**
 * Task-manager wire types (`tepegoz://process`). One row per OS process in the app's process tree,
 * projected from `app.getAppMetrics()` in the main process and joined against the live tab set so a
 * renderer process can be named by the tab it hosts. No local paths, no argv — a process row is
 * PID + coarse kind + resource counters + (for a tab) its id.
 */

/** Coarse process class. `tab` is a renderer hosting one of our browsed tabs; everything else is
 *  browser infrastructure the user can see but (in v1) not end. */
export type ProcessKind = 'browser' | 'gpu' | 'utility' | 'tab';

export interface ProcessRow {
  /** OS process id. Stable for the life of the process; the renderer keys rows on it. */
  pid: number;
  kind: ProcessKind;
  /** Display label — a tab's title (or host) for `tab`, a service name for `utility`, else a fixed
   *  name. Never a file path. */
  label: string;
  /** Whole-process CPU use, percent, one decimal. */
  cpuPercent: number;
  /** Resident memory (working set) in bytes. */
  memoryBytes: number;
  /** Present only for `kind: 'tab'` — the tab id, so the renderer can offer "end process" / focus. */
  tabId?: string | undefined;
  /** Present only for `kind: 'tab'` — true when that tab is currently discarded (sleeping). */
  discarded?: boolean | undefined;
}

export interface ProcessSnapshot {
  rows: ProcessRow[];
  /** `Date.now()` when `app.getAppMetrics()` was sampled. */
  sampledAt: number;
}

/** Payload for `process-metrics:end` — end the renderer process of one tab (by id). Only `tab` rows
 *  can be ended in v1; the browser/GPU/utility processes are shown but not killable from here. */
export interface ProcessEndInput {
  tabId: string;
}
