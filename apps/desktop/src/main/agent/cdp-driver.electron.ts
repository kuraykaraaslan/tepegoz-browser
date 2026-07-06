import { z } from 'zod';
import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import {
  isInteractableRole,
  MAX_INTERACTABLE_ELEMENTS,
  type RawInteractable,
} from '@tepegoz/tool-executor';

/**
 * L4 out-of-process CDP driver. Drives the active tab's page through Electron's `webContents.debugger`
 * (the same out-of-process Chrome DevTools Protocol channel DevTools uses) rather than injecting
 * scripts into the untrusted page context. It reads the accessibility tree (`Accessibility.getFullAXTree`)
 * to build the actionable-element set and dispatches real user input (`Input.dispatchMouseEvent` /
 * `dispatchKeyEvent`) at the element's on-screen box — so clicks/typing behave like a human and can't be
 * observed or tampered with by page JS.
 *
 * One debugger attachment is kept on the currently-active WebContents; switching tabs re-attaches. The
 * `ref → backendNodeId` map from the latest snapshot is what the action calls resolve against, so a
 * `ref` is only valid until the next {@link snapshotElements}. Page-controlled labels stay untrusted —
 * sanitization + taint happen downstream in `@tepegoz/browser-tools` perception.
 */

/** How long to wait for a load to settle before giving up (navigation/click-triggered nav). */
const LOAD_TIMEOUT_MS = 15_000;
/** Quiet period after load/interaction for the DOM to settle before the next perception. */
const SETTLE_MS = 350;
/** Default wheel delta for a scroll step (~one viewport-ish nudge in CSS px). */
const DEFAULT_SCROLL_PX = 600;

/** Minimal AX-node shape we consume (Chromium sends far more; validate only what we read). */
const AxNodeSchema = z
  .object({
    ignored: z.boolean().optional(),
    role: z.object({ value: z.unknown() }).optional(),
    name: z.object({ value: z.unknown() }).optional(),
    value: z.object({ value: z.unknown() }).optional(),
    backendDOMNodeId: z.number().optional(),
    properties: z
      .array(z.object({ name: z.string(), value: z.object({ value: z.unknown() }).optional() }))
      .optional(),
  })
  .passthrough();
const AxTreeSchema = z.object({ nodes: z.array(AxNodeSchema) });

const BoxModelSchema = z.object({ model: z.object({ content: z.array(z.number()) }) });

/** A named key the agent can press → CDP key-event fields. */
const KEY_MAP: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The AX-node value coerced to a trimmed string, or '' when absent/non-scalar. */
function axString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export default class CdpDriver {
  /** The WebContents the debugger is currently attached to (null when detached). */
  private static attached: WebContents | null = null;
  /** ref (1-based) → backendNodeId, from the latest snapshot. Cleared on re-attach/detach. */
  private static refMap = new Map<number, number>();
  /** The WebContents the current refMap belongs to (stale-ref guard across tab switches). */
  private static refWc: WebContents | null = null;

  /** Attach + enable the domains we need on `wc`, re-attaching if the active tab changed. */
  private static async ensureAttached(wc: WebContents): Promise<void> {
    if (CdpDriver.attached === wc && wc.debugger.isAttached()) return;
    CdpDriver.detach();
    try {
      wc.debugger.attach('1.3');
    } catch (err) {
      throw new AppError(
        `Cannot drive the page (is DevTools open on it?): ${String(err)}`,
        409,
      );
    }
    CdpDriver.attached = wc;
    // A tab that navigates/closes must not leave us pointing at a dead session.
    wc.debugger.once('detach', () => {
      if (CdpDriver.attached === wc) CdpDriver.reset();
    });
    wc.once('destroyed', () => {
      if (CdpDriver.attached === wc) CdpDriver.reset();
    });
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('Accessibility.enable');
  }

  /** Detach the debugger from the current WebContents (best-effort; swallows teardown races). */
  private static detach(): void {
    const wc = CdpDriver.attached;
    if (wc !== null && !wc.isDestroyed() && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch (err) {
        Logger.warn('CDP detach failed', { err: String(err) });
      }
    }
    CdpDriver.reset();
  }

  private static reset(): void {
    CdpDriver.attached = null;
    CdpDriver.refWc = null;
    CdpDriver.refMap = new Map();
  }

  /** Read the active page's actionable elements from the accessibility tree. */
  static async snapshotElements(
    wc: WebContents,
  ): Promise<{ url: string; title: string; elements: RawInteractable[] }> {
    await CdpDriver.ensureAttached(wc);
    const raw: unknown = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
    const parsed = AxTreeSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('Failed to read the page accessibility tree', 502);

    const elements: RawInteractable[] = [];
    const refMap = new Map<number, number>();
    for (const node of parsed.data.nodes) {
      if (node.ignored === true || node.backendDOMNodeId === undefined) continue;
      const role = axString(node.role?.value);
      if (role === '' || !isInteractableRole(role)) continue;

      const disabled = node.properties?.some(
        (p) => p.name === 'disabled' && p.value?.value === true,
      );
      const el: RawInteractable = { role, name: axString(node.name?.value) };
      const value = axString(node.value?.value);
      if (value !== '') el.value = value;
      if (disabled === true) el.disabled = true;

      elements.push(el);
      refMap.set(elements.length, node.backendDOMNodeId); // ref is 1-based, aligned with finalizeElements
      if (elements.length >= MAX_INTERACTABLE_ELEMENTS) break;
    }

    CdpDriver.refMap = refMap;
    CdpDriver.refWc = wc;
    return { url: wc.getURL(), title: wc.getTitle(), elements };
  }

  /** Resolve a snapshot `ref` to its backendNodeId, guarding against stale refs / tab switches. */
  private static backendNodeId(wc: WebContents, ref: number): number {
    if (CdpDriver.refWc !== wc) {
      throw new AppError('Element refs are stale — read the page elements again first', 409);
    }
    const id = CdpDriver.refMap.get(ref);
    if (id === undefined) throw new AppError(`No element with ref ${String(ref)}`, 404);
    return id;
  }

  /** The center point (CSS px, viewport-relative) of an element, after scrolling it into view. */
  private static async centerOf(
    wc: WebContents,
    backendNodeId: number,
  ): Promise<{ x: number; y: number }> {
    await wc.debugger
      .sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId })
      .catch(() => undefined); // best-effort; getBoxModel below is the real guard
    const raw: unknown = await wc.debugger.sendCommand('DOM.getBoxModel', { backendNodeId });
    const box = BoxModelSchema.safeParse(raw);
    if (!box.success || box.data.model.content.length < 8) {
      throw new AppError('Element is not visible/clickable', 409);
    }
    const q = box.data.model.content;
    return {
      x: (q[0]! + q[2]! + q[4]! + q[6]!) / 4,
      y: (q[1]! + q[3]! + q[5]! + q[7]!) / 4,
    };
  }

  static async clickElement(
    wc: WebContents,
    ref: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    const backendNodeId = CdpDriver.backendNodeId(wc, ref);
    const { x, y } = await CdpDriver.centerOf(wc, backendNodeId);
    if (adapter === undefined) {
      const base = { x, y, button: 'left' as const, clickCount: 1 };
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    } else {
      await adapter.click(x, y);
    }
    await CdpDriver.settle(wc);
  }

  static async fillElement(
    wc: WebContents,
    ref: number,
    text: string,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    const backendNodeId = CdpDriver.backendNodeId(wc, ref);
    const { x, y } = await CdpDriver.centerOf(wc, backendNodeId);
    if (adapter !== undefined) await adapter.moveTo(x, y);
    await wc.debugger.sendCommand('DOM.focus', { backendNodeId });
    // Select any existing value (Ctrl+A) so the insert replaces it, then type the new text.
    await CdpDriver.sendKey(wc, { key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
    if (adapter === undefined) {
      await wc.debugger.sendCommand('Input.insertText', { text });
    } else {
      await adapter.insertText(text);
    }
    await CdpDriver.settle(wc);
  }

  static async pressKey(
    wc: WebContents,
    key: string,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    const spec = KEY_MAP[key];
    if (spec === undefined) throw new AppError(`Unsupported key: ${key}`, 400);
    if (adapter === undefined) {
      await CdpDriver.sendKey(wc, spec);
    } else {
      await adapter.pressKey(spec);
    }
    await CdpDriver.settle(wc);
  }

  static async scrollPage(
    wc: WebContents,
    direction: 'up' | 'down',
    amount?: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    if (adapter === undefined) {
      const deltaY = (direction === 'down' ? 1 : -1) * (amount ?? DEFAULT_SCROLL_PX);
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 10,
        y: 10,
        deltaX: 0,
        deltaY,
      });
      await delay(SETTLE_MS);
    } else {
      await adapter.scroll(direction, amount);
      await delay(SETTLE_MS);
    }
  }

  /** Dispatch a keyDown+keyUp for one key, with optional modifier bitmask (CDP: 2 = Ctrl). */
  private static async sendKey(
    wc: WebContents,
    spec: { key: string; code: string; keyCode: number; text?: string },
    modifiers = 0,
  ): Promise<void> {
    const common = {
      modifiers,
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.keyCode,
      nativeVirtualKeyCode: spec.keyCode,
    };
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: spec.text === undefined ? 'rawKeyDown' : 'keyDown',
      ...common,
      ...(spec.text === undefined ? {} : { text: spec.text }),
    });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  }

  /** Wait for a load triggered by an interaction to settle, then a short quiet period. */
  private static async settle(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return;
    if (wc.isLoadingMainFrame()) {
      await new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
          resolve();
        };
        const timer = setTimeout(done, LOAD_TIMEOUT_MS);
        wc.once('did-stop-loading', done);
      });
    }
    await delay(SETTLE_MS);
  }
}
