import type { WebContents } from 'electron';

const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
  '<path d="M 4 2 L 4 18 L 8 14 L 11 21 L 13 20 L 10 13 L 16 13 Z"' +
  ' fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/** Style-tag id used to suppress the OS cursor while automation drives the page. */
const HIDE_STYLE_ID = '__tpz_no_cursor';

/** Per-WebContents cleanup for the `input-event` hardware-mouse listener. */
const listenerMap = new WeakMap<WebContents, () => void>();

/**
 * True while the user's real mouse is physically inside the active WebContentsView.
 * `showPageCursor` is a no-op when this is true (user has taken back control).
 * `HumanInputAdapter.moveTo` polls this via `isUserControlActive()` to abort early.
 */
let userHasControl = false;

/** Read by the HumanInputAdapter to yield mid-movement when the user takes over. */
export function isUserControlActive(): boolean {
  return userHasControl;
}

/**
 * Called at the start of each agent browser action (click, fill, scroll…).
 * Resets the user-control flag so the agent cursor is always visible when an action begins.
 * The user can still interrupt mid-action — the hardware listener will set it back to `true`
 * the moment their physical mouse enters the webview.
 */
export function resetForAgentAction(): void {
  userHasControl = false;
}

/**
 * Attach a hardware-mouse listener on `wc` (idempotent).
 * `mouseMove`  → user entered the webview, yield control to real cursor.
 * `mouseLeave` → user left the webview, agent may resume on the next action.
 */
function attachListener(wc: WebContents): void {
  if (listenerMap.has(wc)) return;
  const handler = (_: Electron.Event, ie: Electron.InputEvent): void => {
    if (ie.type === 'mouseMove') {
      if (!userHasControl) {
        userHasControl = true;
        // Remove cursor-none style and hide our SVG cursor so the real OS cursor shows.
        if (!wc.isDestroyed()) {
          void wc.executeJavaScript(
            `(function(){` +
              `var s=document.getElementById('${HIDE_STYLE_ID}');if(s)s.remove();` +
              `var e=document.getElementById('__tpz_c');if(e)e.style.display='none';` +
              `})()`,
          );
        }
      }
    } else if (ie.type === 'mouseLeave') {
      userHasControl = false;
    }
  };
  wc.on('input-event', handler);
  listenerMap.set(wc, () => wc.removeListener('input-event', handler));
}

function detachListener(wc: WebContents): void {
  const cleanup = listenerMap.get(wc);
  if (cleanup !== undefined) {
    cleanup();
    listenerMap.delete(wc);
  }
}

/**
 * Inject or reposition the simulated cursor element in a live content page.
 * Also hides the OS cursor via a `cursor:none` style tag so only our SVG is visible.
 * Skips silently when the user's real mouse is currently inside the webview.
 */
export function showPageCursor(wc: WebContents, x: number, y: number): void {
  if (wc.isDestroyed()) return;
  attachListener(wc);
  if (userHasControl) return; // real cursor is active — don't override

  void wc.executeJavaScript(
    `(function(){` +
      // Inject cursor-none style tag (idempotent)
      `var s=document.getElementById('${HIDE_STYLE_ID}');` +
      `if(!s){s=document.createElement('style');s.id='${HIDE_STYLE_ID}';` +
      `document.head&&document.head.appendChild(s);}` +
      `s.textContent='*,*::before,*::after{cursor:none!important}';` +
      // Create or reposition the SVG cursor overlay div
      `var e=document.getElementById('__tpz_c');` +
      `if(!e){e=document.createElement('div');e.id='__tpz_c';` +
      `e.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;width:24px;height:24px;';` +
      `e.innerHTML=${JSON.stringify(CURSOR_SVG)};` +
      `document.body&&document.body.appendChild(e);}` +
      `e.style.left='${x.toFixed(1)}px';` +
      `e.style.top='${y.toFixed(1)}px';` +
      `e.style.display='block';` +
      `})()`,
  );
}

/**
 * Hide the injected cursor and restore the OS cursor (removes the cursor-none style).
 * Also detaches the hardware-mouse listener and clears the user-control flag.
 */
export function hidePageCursor(wc: WebContents): void {
  if (wc.isDestroyed()) return;
  detachListener(wc);
  userHasControl = false;
  void wc.executeJavaScript(
    `(function(){` +
      `var s=document.getElementById('${HIDE_STYLE_ID}');if(s)s.remove();` +
      `var e=document.getElementById('__tpz_c');if(e)e.style.display='none';` +
      `})()`,
  );
}
