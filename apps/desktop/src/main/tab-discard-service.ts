import PreferenceStore from '@tepegoz/preferences';
import TabManager from './tabs';

/**
 * Background-tab discard (sleep) — Phase 2b narrow scope. Caps memory by destroying a background tab's
 * `WebContentsView` once it has sat unfocused past a configurable idle window; `WindowTabsDiscard`
 * rebuilds it and reloads the URL the moment the tab is next activated.
 *
 * Polling, not an activation-event hook: the tab model already exposes its full live state through
 * `TabManager.all()`/`getState()` every tick, and a once-a-minute scan is cheap next to the memory a
 * forgotten background tab holds — adding a new "tab lost focus" observer to the tab model, only for
 * this one caller, would be more plumbing than the feature is worth.
 */
const CHECK_INTERVAL_MS = 60_000;

/** When each currently-background tab was last seen as NOT the active tab of its window. Reset (deleted)
 *  the moment a tab becomes active again, discarded, or closed — so it always reflects one unbroken
 *  stretch in the background, never an accumulated total across several visits. */
const backgroundSince = new Map<string, number>();

let timer: ReturnType<typeof setInterval> | null = null;

/** One scan. Exported for the unit test — real time is not something a test should have to wait out. */
export function sweep(now: number = Date.now()): void {
  const prefs = PreferenceStore.getAll();
  if (!prefs.tabDiscardEnabled) return;
  const idleMs = prefs.tabDiscardIdleMinutes * 60_000;
  const liveIds = new Set<string>();

  for (const wt of TabManager.all()) {
    const state = wt.getState();
    for (const tab of state.tabs) {
      liveIds.add(tab.id);
      if (!wt.canDiscard(tab.id)) {
        backgroundSince.delete(tab.id);
        continue;
      }
      const since = backgroundSince.get(tab.id);
      if (since === undefined) {
        backgroundSince.set(tab.id, now);
        continue;
      }
      if (now - since >= idleMs) {
        wt.discardTab(tab.id);
        backgroundSince.delete(tab.id);
      }
    }
  }
  // Forget tabs that no longer exist (closed since the last scan) so the map cannot grow unbounded
  // across a long-running session.
  for (const id of backgroundSince.keys()) {
    if (!liveIds.has(id)) backgroundSince.delete(id);
  }
}

function init(): void {
  if (timer !== null) return;
  timer = setInterval(sweep, CHECK_INTERVAL_MS);
  // Node-only: never hold the process open just to run this scan (Electron's own event loop already does).
  timer.unref?.();
}

function stop(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  backgroundSince.clear();
}

export default { init, stop, sweep };
