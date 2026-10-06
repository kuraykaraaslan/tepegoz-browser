import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';
import type { HumanInputAdapter } from '@tepegoz/human-input';
import type { DriverCore } from './cdp-driver-schemas.electron.js';
import { centerOf, isNativeDraggable } from './cdp-driver-dom.electron.js';

/**
 * Drag concern of the input driver (see `cdp-driver-input.electron`): native HTML5 drag via CDP drag
 * interception versus pointer-driven drag via raw mouse events.
 */

/** How long to wait for Chromium to report an intercepted native drag before giving up (S3 PR6). A real
 *  `dragstart` fires within a frame or two of the qualifying mouse move; anything longer means the
 *  element was not actually draggable despite {@link isNativeDraggable} saying so (e.g. a `dragstart`
 *  listener that calls `preventDefault()`), and holding the intercept open indefinitely would leave the
 *  tab's next real drag silently swallowed. */
const DRAG_INTERCEPT_TIMEOUT_MS = 2000;

/** Linear waypoints between two points (inclusive of both ends) — dispatched drag/mouse events need
 *  intermediate positions for the same reason a synthetic click needs a real path: several JS drag
 *  implementations only start responding once they have seen movement, not just a start and end point. */
function waypoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
}

/**
 * One raw CDP `Input.dragIntercepted` event's `data` payload, forwarded verbatim to
 * `Input.dispatchDragEvent` — this driver never inspects or constructs it, only relays what Chromium
 * itself produced from the page's own `dragstart`/`dataTransfer`.
 */
async function waitForDragIntercepted(wc: WebContents, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      wc.debugger.removeListener('message', onMessage);
      reject(new AppError('Element did not start a native drag', 409));
    }, timeoutMs);
    function onMessage(_event: unknown, method: string, params?: unknown): void {
      if (method !== 'Input.dragIntercepted') return;
      clearTimeout(timer);
      wc.debugger.removeListener('message', onMessage);
      resolve((params as { data?: unknown } | undefined)?.data);
    }
    wc.debugger.on('message', onMessage);
  });
}

/**
 * Drag from one element to another (S3 PR6 spike).
 *
 * Two real, incompatible drag mechanisms exist on the web and neither substitutes for the other:
 * **native HTML5 drag** (`draggable="true"`, `dragstart`/`dragover`/`drop`) fires ONLY through Chromium's
 * own drag machinery — plain mouse events never trigger it, because a real OS-level drag normally starts
 * one. **Pointer-driven drag** (most sortable-list / kanban-board widgets, including this app's own
 * `@dnd-kit` tab-group reorder) is exactly the opposite: it is built entirely from ordinary
 * mousedown/mousemove/mouseup and has no `dragstart` at all. {@link isNativeDraggable} decides which
 * path to take.
 *
 * The native path is `Input.setInterceptDrags` + `Input.dispatchDragEvent` — CDP's purpose-built
 * replacement for the OS-level drag session that never touches this driver, spike-verified against a
 * real `draggable="true"` element (dragstart → `Input.dragIntercepted` → dragEnter/dragOver/drop
 * completed a real `drop` handler's `dataTransfer` read). `dispatchDragEvent`'s own `data` field is never
 * constructed here — it is exactly what Chromium reported intercepting, relayed back unmodified, because
 * inventing a `dataTransfer` payload the page never produced is indistinguishable from typing text no
 * user typed into a fill.
 */
export async function dragElement(
  wc: WebContents,
  ref: number,
  targetRef: number,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<{ mode: 'native' | 'pointer' }> {
  await core.ensure(wc);
  const node = await core.resolveRef(wc, ref);
  const targetNode = await core.resolveRef(wc, targetRef);
  const src = await centerOf(wc, node);
  const dst = await centerOf(wc, targetNode);
  if (adapter !== undefined) await adapter.idle(); // human think/react pause, matching every other gesture
  const native = await isNativeDraggable(wc, node);
  const mid = { x: (src.x + dst.x) / 2, y: (src.y + dst.y) / 2 };
  if (!native) {
    // Pointer-driven: hold the button down and move through, exactly what a mouse-based sortable widget
    // listens for. `buttons: 1` on every move while the button is held — some libraries gate their
    // `pointermove`/`mousemove` handler on it, and a move event with no button reads as an idle hover.
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: src.x,
      y: src.y,
      button: 'left',
      clickCount: 1,
    });
    for (const p of waypoints(src, dst, 5).slice(1)) {
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: p.x,
        y: p.y,
        button: 'left',
        buttons: 1,
      });
    }
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: dst.x,
      y: dst.y,
      button: 'left',
    });
    await core.settle(wc);
    return { mode: 'pointer' };
  }
  await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
  try {
    const intercepted = waitForDragIntercepted(wc, DRAG_INTERCEPT_TIMEOUT_MS);
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: src.x,
      y: src.y,
      button: 'left',
      clickCount: 1,
    });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: mid.x,
      y: mid.y,
      button: 'left',
    });
    const data = await intercepted;
    await wc.debugger.sendCommand('Input.dispatchDragEvent', {
      type: 'dragEnter',
      x: mid.x,
      y: mid.y,
      data,
    });
    await wc.debugger.sendCommand('Input.dispatchDragEvent', {
      type: 'dragOver',
      x: dst.x,
      y: dst.y,
      data,
    });
    await wc.debugger.sendCommand('Input.dispatchDragEvent', {
      type: 'drop',
      x: dst.x,
      y: dst.y,
      data,
    });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: dst.x,
      y: dst.y,
      button: 'left',
    });
  } finally {
    // Left enabled, every future drag gesture on this tab — including a real one from the user — would
    // be silently swallowed waiting for a dispatchDragEvent nobody sends.
    await wc.debugger
      .sendCommand('Input.setInterceptDrags', { enabled: false })
      .catch(() => undefined);
  }
  await core.settle(wc);
  return { mode: 'native' };
}
