import type { Input, WebContents } from 'electron';
import type { ZoomDirection } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import { originOf } from './tabs-popup-policy';
import { isWebUrl } from './lib/navigation-url';

/**
 * Per-site zoom persistence (Phase 2c). Chromium keeps zoom per *session* and forgets it on restart;
 * Chrome keeps it per *origin*, forever, which is what people actually expect. This module is that
 * memory: it stores a zoom FACTOR per origin in preferences and re-applies it on every committed
 * navigation.
 *
 * Only origins that differ from 100% are stored, and resetting deletes the key — so the record cannot
 * quietly grow into a list of every site the user has ever visited.
 */

/** Chrome's zoom stops. Stepping through a fixed ladder is what makes Ctrl+= feel right. */
const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const;

/** Factors are floats off a ladder; compare with a tolerance rather than for equality. */
const EPSILON = 0.001;

/**
 * The level a site gets when it has none of its own — a PREFERENCE now, not the constant 1.
 *
 * Making it settable is what turns "zoom every page a little" from a per-site chore into one control,
 * which is the whole point of the Accessibility page. It also keeps per-site storage honest: a site
 * left at the user's own default stores nothing, exactly as a site left at 100% stored nothing before.
 */
function defaultFactor(): number {
  return PreferenceStore.getAll().defaultPageZoom;
}

function storedFactor(origin: string): number {
  return PreferenceStore.getAll().siteZoomFactors[origin] ?? defaultFactor();
}

function persist(origin: string, factor: number): void {
  const current = PreferenceStore.getAll().siteZoomFactors;
  const next = { ...current };
  if (Math.abs(factor - defaultFactor()) < EPSILON) delete next[origin];
  else next[origin] = factor;
  PreferenceStore.update({ siteZoomFactors: next });
}

/** The ladder step next to `factor` in `direction` (+1 in, -1 out); clamped at both ends. */
function step(factor: number, direction: 1 | -1): number {
  if (direction === 1)
    return ZOOM_STEPS.find((s) => s > factor + EPSILON) ?? ZOOM_STEPS.at(-1) ?? 1;
  return [...ZOOM_STEPS].reverse().find((s) => s < factor - EPSILON) ?? ZOOM_STEPS[0];
}

/**
 * Re-apply the stored zoom for whatever `wc` has just navigated to. Called on every committed
 * navigation, because crossing an origin boundary must change the zoom — staying at the previous
 * site's level is the bug this replaces.
 */
export function applyStoredZoom(wc: WebContents): void {
  if (wc.isDestroyed()) return;
  const url = wc.getURL();
  if (!isWebUrl(url)) return;
  const origin = originOf(url);
  if (origin === '') return;
  wc.setZoomFactor(storedFactor(origin));
}

/** Change the active page's zoom by one ladder step and remember it for that origin. */
function changeZoom(wc: WebContents, direction: 1 | -1): void {
  const url = wc.getURL();
  const origin = originOf(url);
  if (!isWebUrl(url) || origin === '') return;
  const next = step(wc.getZoomFactor(), direction);
  wc.setZoomFactor(next);
  persist(origin, next);
}

/** Back to the user's default level and forget the origin's stored one. */
function resetZoom(wc: WebContents): void {
  const url = wc.getURL();
  const origin = originOf(url);
  if (!isWebUrl(url) || origin === '') return;
  wc.setZoomFactor(defaultFactor());
  persist(origin, defaultFactor());
}

/**
 * Ctrl/Cmd + `=`/`+`/`-`/`0` on the ACTIVE page. Returns true when handled, so the caller can
 * `preventDefault` and stop the key reaching the page.
 *
 * Wired from both the chrome window and every web view, because the shortcut has to work whether the
 * omnibox or the page has focus — and `wc` is resolved by the caller for exactly that reason.
 */
export function handleZoomShortcut(input: Input, wc: WebContents | null): boolean {
  if (input.type !== 'keyDown' || wc === null || wc.isDestroyed()) return false;
  if (!input.control && !input.meta) return false;
  if (input.alt) return false;

  const key = input.key;
  if (key === '=' || key === '+') {
    changeZoom(wc, 1);
    return true;
  }
  if (key === '-' || key === '_') {
    changeZoom(wc, -1);
    return true;
  }
  if (key === '0') {
    resetZoom(wc);
    return true;
  }
  return false;
}

/**
 * The omnibox zoom indicator's −, +, and Reset buttons. Same effect as the Ctrl `-`/`=`/`0`
 * shortcuts (`changeZoom`/`resetZoom`), reached from the renderer instead of a key — so the ladder
 * stepping and the per-origin persistence are shared, not re-derived. A view-less internal tab has no
 * `wc` and is a no-op.
 */
export function applyZoomCommand(wc: WebContents | null, direction: ZoomDirection): void {
  if (wc === null || wc.isDestroyed()) return;
  if (direction === 'reset') resetZoom(wc);
  else changeZoom(wc, direction === 'in' ? 1 : -1);
}

/**
 * Re-apply zoom to every open page. Called when the DEFAULT changes, because a new default that only
 * took effect on the next navigation would look like a setting that did not work.
 *
 * `applyStoredZoom` already refuses anything that is not a web page, so the chrome and the internal
 * `tepegoz://` views are skipped without this having to know about them.
 */
export function reapplyZoomEverywhere(all: readonly WebContents[]): void {
  for (const wc of all) applyStoredZoom(wc);
}

/** Exposed for tests + any future zoom UI (a Chrome-style zoom indicator in the omnibox). */
export const ZOOM_LADDER: readonly number[] = ZOOM_STEPS;
