import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import TabManager from '../tabs';
import CdpDriver from './cdp-driver.electron';
import TranslatePageInjector from '../extensions/translate-page-injector-controller.electron';
import { currentRunRecord } from './browser-host-run-scope.electron';

const DEFAULT_LOAD_TIMEOUT_MS = 15_000;

export async function waitForLoad(
  wc: WebContents,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
): Promise<void> {
  await CdpDriver.waitForPageSettled(wc, timeoutMs);
}

/**
 * The tab a run means when it names no `tabId` — its OWN working tab, not "whatever is active now".
 *
 * A run latches its working tab the first time it needs one, from the tab that is globally active at
 * that moment. That first read is what makes "summarize this page" work: the page the user was looking
 * at when they asked is the page the run binds to, even if it belongs to no group or to another one.
 * From then on the run keeps driving that tab, and follows it only through its OWN navigations
 * ({@link setRunCurrentTab}).
 *
 * Two things fall out of the latch. A user switching tabs mid-run no longer silently re-targets the
 * agent — previously the next `tabId`-less action jumped to the newly-focused page. And two runs no
 * longer resolve to the same tab, which is the property that lets them run at once.
 *
 * If the latched tab is gone (closed), the run re-latches onto whatever is active — a run whose page
 * was closed under it should keep working, not die.
 */
function resolveRunTab(): WebContents | null {
  const record = currentRunRecord();
  if (record !== null && record.currentTabId !== null) {
    const held = TabManager.webContentsForTab(record.currentTabId);
    if (held !== null && !held.isDestroyed()) return held;
  }
  const active = TabManager.activeWebContents();
  if (active !== null && record !== null) {
    // Latch (or re-latch) so every later tabId-less action in this run means THIS tab.
    record.currentTabId = TabManager.getState().activeId;
  }
  return active;
}

/** The target tab's WebContents for CDP-driven perception/action, or a 409 when there is none. */
export function requireWc(tabId?: string): WebContents {
  const wc = tabId === undefined ? resolveRunTab() : TabManager.webContentsForTab(tabId);
  if (wc === null)
    throw new AppError(tabId === undefined ? 'No active page' : `No web tab: ${tabId}`, 409);
  return wc;
}

/**
 * As {@link requireWc}, but first restores any in-place page translation so the agent reads
 * untranslated source (ADR-0042 §3). Use for every path that reads DOM text/structure into the model
 * or the Notary; plain {@link requireWc} is fine for pure actions (click, scroll-by-pixels).
 */
export async function requireWcUntranslated(tabId?: string): Promise<WebContents> {
  const wc = requireWc(tabId);
  await TranslatePageInjector.ensureUntranslatedForAgent(wc).catch(() => undefined);
  return wc;
}

/** The URL of the tab THIS run is working in — the Policy Kernel's site context, so the site a call is
 *  judged against is always the site it will actually hit. */
export function runActiveTabUrl(): string | undefined {
  const wc = resolveRunTab();
  if (wc === null || wc.isDestroyed()) return undefined;
  const url = wc.getURL();
  return url.length > 0 ? url : undefined;
}

/**
 * OS pid of the tab THIS run is working in, for resource-sampling attribution (S7 PR6 "Resource
 * accounting per run"). Reuses the SAME tab-to-process resolution `runActiveTabUrl` does
 * ({@link resolveRunTab}, the run's latched working tab) rather than a second lookup, so "which renderer
 * is this run's cost" and "which page is this run's site context" always agree. Null when the run has
 * no working tab yet, or its OS pid cannot be read (mirrors the try/catch in the Task Manager's own
 * `liveTabs()`, `process-metrics.electron.ts`, which the same call can fail the same way).
 */
export function runWorkingTabPid(): number | null {
  const wc = resolveRunTab();
  if (wc === null || wc.isDestroyed()) return null;
  try {
    const pid = wc.getOSProcessId();
    return pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
