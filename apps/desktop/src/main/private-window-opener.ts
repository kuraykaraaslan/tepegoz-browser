/**
 * A one-function seam for "open a new private window".
 *
 * Exists because of a measured cycle, not style. `browser-windows.ts` owns `openWindow` and imports the
 * tab model; `tabs-view-wiring.ts` is imported BY that model, so it cannot import back — the same
 * constraint that put the page commands in `page-commands.ts`. The chrome window and the page views
 * both answer Ctrl+Shift+N (it is `main` scope precisely so it works while a PAGE has focus), so both
 * need the same opener, and this is the smallest thing that gives it to them.
 */

let opener: (() => void) | null = null;

/** Installed once by `browser-windows.ts`, which is the only module allowed to create windows. */
export function setPrivateWindowOpener(fn: (() => void) | null): void {
  opener = fn;
}

/** Open a private window, or do nothing if the app has not finished starting. */
export function openPrivateWindow(): void {
  opener?.();
}
