import type { HandlerDetails } from 'electron';
import { TAB_GROUP_COLORS, DEFAULT_GROUP_COLOR, type TabGroupColor } from '@tepegoz/tab-engine';

/**
 * Pure popup/navigation-safety predicates used by `TabManager`'s view wiring (`./tabs`). Split out
 * of `tabs.ts` (ADR-0010 250-line cap) — none of these reference `TabManager`'s own state, so they
 * are plain, independently-testable functions of their arguments.
 */

/** Coerce a persisted (untyped) group color back to a valid `TabGroupColor`, defaulting if unknown. */
export function asGroupColor(color: string): TabGroupColor {
  return (TAB_GROUP_COLORS as readonly string[]).includes(color)
    ? (color as TabGroupColor)
    : DEFAULT_GROUP_COLOR;
}

/** The origin of a URL (`https://example.com`), or '' when it can't be parsed (keys the popup policy). */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** A popup opened with no explicit URL targets `about:blank` (matches the DOM's window.open default). */
export function popupTargetUrl(url: string): string {
  return url.trim().length === 0 ? 'about:blank' : url;
}

/** Schemes whose popup MUST be created natively by Electron so `window.open` returns a live, scriptable
 *  reference to the opener (about:blank / data: / javascript: — used by document.write / contentWindow
 *  style popups). A plain http(s) popup can instead open as one of our tabs. */
export function needsNativeWindow(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === '' || u === 'about:blank' || u.startsWith('data:') || u.startsWith('javascript:');
}

/** Whether the page asked for a real popup WINDOW rather than a tab: geometry in `features`, an explicit
 *  new-window disposition, or a POST body (a form target=_blank whose POST we must not drop). */
export function wantsNativeWindow(details: HandlerDetails): boolean {
  return (
    details.disposition === 'new-window' ||
    details.postBody != null ||
    /\b(?:width|height|innerwidth|innerheight)\b/i.test(details.features)
  );
}

/** Block navigations to dangerous schemes (anything but http(s)/about:) on a browsed webContents — on
 *  BOTH will-navigate and will-redirect (the latter alone misses redirect hops). */
export function blockNonWeb(event: { preventDefault: () => void }, url: string): void {
  if (!/^(https?:|about:)/i.test(url)) event.preventDefault();
}

/** How long (ms) a discrete user input keeps the page "user-activated" for popup purposes. Chrome's
 *  transient activation is 5s; a click→window.open fires synchronously, so a short window is ample and
 *  keeps a stale gesture from later whitelisting an auto-popup. */
export const GESTURE_ACTIVATION_MS = 1000;

/** Discrete inputs that count as a user gesture (grant transient activation). Scroll / mouse-move /
 *  pointer-move do NOT — matching the browser, which only activates on clicks, key presses and taps. */
export function isActivatingInput(type: string): boolean {
  return (
    type === 'mouseDown' ||
    type === 'keyDown' ||
    type === 'rawKeyDown' ||
    type === 'pointerDown' ||
    type === 'touchStart' ||
    type === 'gestureTap'
  );
}
