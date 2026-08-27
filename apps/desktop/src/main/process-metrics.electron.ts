import { app } from 'electron';
import type { ProcessKind, ProcessRow, ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { Logger } from '@tepegoz/libs';
import TabManager from './tabs';

/**
 * Task manager (`tepegoz://process`) — a Chrome-style view of the app's OS process tree.
 *
 * `app.getAppMetrics()` returns one entry per process (browser, GPU, each utility service, each
 * renderer) with CPU and working-set memory. We join it against the live tab set so a renderer entry
 * is named by the tab it hosts and carries that tab's id (for "end process"). Discarded tabs have no
 * renderer of their own and are added as zero-cost rows so the view still shows they exist.
 *
 * There is no push: the page polls `getProcessMetrics` on its own interval. `endTabProcess` force-
 * crashes exactly one tab's renderer (`WindowTabsDiscard` / the tab's own reload rebuilds it on next
 * activation, same as a discard) — the browser/GPU/utility processes are shown but not killable here.
 */

/** One tab as the metrics join needs it. */
interface TabLite {
  tabId: string;
  title: string;
  url: string;
  discarded: boolean;
  /** The renderer's OS pid, or null for a discarded / not-yet-loaded tab. */
  pid: number | null;
}

/** `app.getAppMetrics()` element, narrowed to what we read. */
export interface RawProcessMetric {
  pid: number;
  type: string;
  cpu: { percentCPUUsage: number };
  memory: { workingSetSize: number };
  name?: string | undefined;
  serviceName?: string | undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/**
 * Pure projection: `app.getAppMetrics()` + the tab set → renderer rows. Extracted from the Electron
 * call so it is unit-tested without a running app.
 *
 * `workingSetSize` is in KiB (Electron docs) — converted to bytes here so the renderer only formats.
 */
export function mapAppMetrics(metrics: readonly RawProcessMetric[], tabs: readonly TabLite[]): ProcessRow[] {
  const tabByPid = new Map<number, TabLite>();
  for (const t of tabs) if (t.pid !== null) tabByPid.set(t.pid, t);

  const rows: ProcessRow[] = metrics.map((m) => {
    const owningTab = tabByPid.get(m.pid);
    const cpuPercent = Math.round(m.cpu.percentCPUUsage * 10) / 10;
    const memoryBytes = Math.max(0, Math.round(m.memory.workingSetSize) * 1024);
    if (owningTab !== undefined) {
      return {
        pid: m.pid,
        kind: 'tab' as ProcessKind,
        label: owningTab.title.trim() !== '' ? owningTab.title : hostOf(owningTab.url),
        cpuPercent,
        memoryBytes,
        tabId: owningTab.tabId,
        discarded: false,
      };
    }
    const kind: ProcessKind =
      m.type === 'Browser' ? 'browser' : m.type === 'GPU' ? 'gpu' : 'utility';
    const label =
      kind === 'browser'
        ? 'Browser'
        : kind === 'gpu'
          ? 'GPU'
          : (m.name ?? m.serviceName ?? m.type ?? 'Utility');
    return { pid: m.pid, kind, label, cpuPercent, memoryBytes };
  });

  // Discarded tabs have no metrics entry — surface them as zero rows so "which tabs are asleep" is
  // visible. `pid: 0` reads as "no process" in the UI.
  for (const t of tabs) {
    if (!t.discarded) continue;
    rows.push({
      pid: 0,
      kind: 'tab',
      label: t.title.trim() !== '' ? t.title : hostOf(t.url),
      cpuPercent: 0,
      memoryBytes: 0,
      tabId: t.tabId,
      discarded: true,
    });
  }
  return rows;
}

/** Every tab in every window, with its renderer pid resolved (null when discarded / view-less). */
function liveTabs(): TabLite[] {
  const out: TabLite[] = [];
  for (const wt of TabManager.all()) {
    for (const tab of wt.getState().tabs) {
      const wc = wt.webContentsForTab(tab.id);
      let pid: number | null = null;
      if (wc !== null && !wc.isDestroyed()) {
        try {
          pid = wc.getOSProcessId();
        } catch {
          pid = null;
        }
      }
      out.push({
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        discarded: tab.discarded === true,
        pid: pid !== null && pid > 0 ? pid : null,
      });
    }
  }
  return out;
}

export function collectProcessSnapshot(): ProcessSnapshot {
  const rows = mapAppMetrics(app.getAppMetrics(), liveTabs());
  return { rows, sampledAt: Date.now() };
}

/** Force-crash one tab's renderer. No-op for an unknown / discarded / view-less tab. */
export function endTabProcess(tabId: string): void {
  for (const wt of TabManager.all()) {
    const wc = wt.webContentsForTab(tabId);
    if (wc !== null && !wc.isDestroyed()) {
      Logger.info('Task manager: ending tab renderer', { tabId });
      wc.forcefullyCrashRenderer();
      return;
    }
  }
}
