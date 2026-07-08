import { z } from 'zod';
import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import {
  isInteractableRole,
  parseDomTree,
  markNewElements,
  resolveNodePath,
  MAX_INTERACTABLE_ELEMENTS,
  type RawInteractable,
  type NodePath,
} from '@tepegoz/tool-executor';
import { buildDomTreeExpression } from './build-dom-tree-script.js';

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
const DescribeNodeSchema = z.object({
  node: z.object({
    localName: z.string().optional(),
    nodeName: z.string().optional(),
    attributes: z.array(z.string()).optional(),
  }),
});
const FrameTreeSchema = z
  .object({
    frameTree: z.object({ frame: z.object({ id: z.string() }).passthrough() }).passthrough(),
  })
  .passthrough();
const IsolatedWorldSchema = z.object({ executionContextId: z.number().int().nonnegative() }).passthrough();
const NetworkRequestSchema = z
  .object({ requestId: z.string(), type: z.string().optional() })
  .passthrough();
const NetworkCompleteSchema = z.object({ requestId: z.string() }).passthrough();
const ResolveSchema = z.object({ object: z.object({ objectId: z.string() }).passthrough() });
const CallResultSchema = z.object({ result: z.object({ value: z.unknown() }).passthrough() });
/** Runtime.evaluate result envelope when we ask for a handle (not by-value). */
const EvalHandleSchema = z.object({
  result: z.object({ objectId: z.string().optional(), subtype: z.string().optional() }).passthrough(),
});
/** The render-DOM perception payload (page-controlled → validated here, the CDP trust boundary). */
const DomTreeNodeSchema = z
  .object({
    tag: z.string(),
    path: z.array(z.array(z.number().int().nonnegative())),
    role: z.string(),
    name: z.string(),
    href: z.string().optional(),
    value: z.string().optional(),
    disabled: z.boolean().optional(),
    attributes: z.record(z.string()).optional(),
    inputType: z.string().optional(),
    accept: z.string().optional(),
    multiple: z.boolean().optional(),
  })
  .passthrough();
const DomTreeResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  nodes: z.array(DomTreeNodeSchema),
});

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

/**
 * How a snapshot `ref` maps back to a DOM node. The accessibility path resolves directly by
 * `backendNodeId`; the render-DOM path (AI-2) stores a child-index `path` (crossing shadow/iframe
 * boundaries) re-resolved lazily at action time (keeps a snapshot cheap — only the acted-on element
 * is resolved).
 */
type RefTarget = { backendNodeId: number } | { path: NodePath };
/** A node handle any DOM.* command accepts — either an existing backend id or a live object handle. */
type NodeArg = { backendNodeId: number } | { objectId: string };

/** The AX-node value coerced to a trimmed string, or '' when absent/non-scalar. */
function axString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function attributesMap(attrs: string[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (attrs === undefined) return map;
  for (let i = 0; i < attrs.length; i += 2) {
    const key = attrs[i];
    if (key !== undefined) map.set(key.toLowerCase(), attrs[i + 1] ?? '');
  }
  return map;
}

export default class CdpDriver {
  /** The WebContents the debugger is currently attached to (null when detached). */
  private static attached: WebContents | null = null;
  /** Per-tab ref (1-based) → node target maps, from each tab's latest snapshot. */
  private static readonly refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
  /** Per-tab previous render-DOM snapshot (url + element fingerprints) for `*[n]` new-element marking. */
  private static readonly prevSnapshots = new WeakMap<WebContents, { url: string; hashes: Set<string> }>();

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
      if (CdpDriver.attached === wc) CdpDriver.attached = null;
    });
    wc.once('destroyed', () => {
      if (CdpDriver.attached === wc) CdpDriver.attached = null;
      CdpDriver.refMaps.delete(wc);
      CdpDriver.prevSnapshots.delete(wc);
    });
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('Accessibility.enable');
    await wc.debugger.sendCommand('Page.enable');
    await wc.debugger.sendCommand('Runtime.enable');
    await wc.debugger.sendCommand('Network.enable');
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
    CdpDriver.attached = null;
  }

  /** Perception source: render-DOM (AI-2 default) unless `TEPEGOZ_PERCEPTION=a11y` forces the fallback. */
  private static perceptionMode(): 'render-dom' | 'a11y' {
    return process.env.TEPEGOZ_PERCEPTION === 'a11y' ? 'a11y' : 'render-dom';
  }

  /**
   * Read the active page's actionable elements. Uses render-DOM perception (interactivity + occlusion
   * + viewport + `href`/attributes) by default, falling back to the accessibility-tree snapshot when
   * that path is disabled or errors. Both populate the per-tab `ref → node` map for action dispatch.
   */
  static async snapshotElements(
    wc: WebContents,
  ): Promise<{ url: string; title: string; elements: RawInteractable[] }> {
    if (CdpDriver.perceptionMode() === 'render-dom') {
      try {
        return await CdpDriver.snapshotElementsRenderDom(wc);
      } catch (err) {
        Logger.warn('render-DOM perception failed; falling back to a11y', { err: String(err) });
      }
    }
    return CdpDriver.snapshotElementsA11y(wc);
  }

  /** Render-DOM perception (AI-2): inject `buildDomTree` in an isolated world, validate, map to refs. */
  private static async snapshotElementsRenderDom(
    wc: WebContents,
  ): Promise<{ url: string; title: string; elements: RawInteractable[] }> {
    await CdpDriver.ensureAttached(wc);
    const contextId = await CdpDriver.mainFrameIsolatedContext(wc);
    const raw: unknown = await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: buildDomTreeExpression(),
      contextId,
      returnByValue: true,
      awaitPromise: false,
      silent: true,
    });
    const call = CallResultSchema.safeParse(raw);
    if (!call.success) throw new AppError('render-DOM perception returned no value', 502);
    const tree = DomTreeResultSchema.safeParse(call.data.result.value);
    if (!tree.success) throw new AppError('render-DOM perception payload malformed', 502);

    const { interactables, paths, hashes } = parseDomTree(tree.data);

    // Mark elements that appeared since the previous snapshot of the SAME page (e.g. a menu the
    // agent just opened). A navigation (url change) or the first snapshot marks nothing new.
    const prev = CdpDriver.prevSnapshots.get(wc);
    const prevHashes = prev !== undefined && prev.url === tree.data.url ? prev.hashes : null;
    const isNew = markNewElements(hashes, prevHashes);
    interactables.forEach((raw, i) => {
      if (isNew[i] === true) raw.isNew = true;
    });
    CdpDriver.prevSnapshots.set(wc, { url: tree.data.url, hashes: new Set(hashes) });

    const refMap = new Map<number, RefTarget>();
    interactables.forEach((_, i) => {
      const path = paths[i];
      if (path !== undefined) refMap.set(i + 1, { path });
    });
    CdpDriver.refMaps.set(wc, refMap);
    return { url: tree.data.url, title: tree.data.title, elements: interactables };
  }

  /** Read the active page's actionable elements from the accessibility tree (fallback path). */
  private static async snapshotElementsA11y(
    wc: WebContents,
  ): Promise<{ url: string; title: string; elements: RawInteractable[] }> {
    await CdpDriver.ensureAttached(wc);
    const raw: unknown = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
    const parsed = AxTreeSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('Failed to read the page accessibility tree', 502);

    const elements: RawInteractable[] = [];
    const refMap = new Map<number, RefTarget>();
    for (const node of parsed.data.nodes) {
      if (node.ignored === true || node.backendDOMNodeId === undefined) continue;
      const fileInput = await CdpDriver.fileInputInfo(wc, { backendNodeId: node.backendDOMNodeId });
      const role = axString(node.role?.value) || (fileInput !== null ? 'button' : '');
      if (fileInput === null && (role === '' || !isInteractableRole(role))) continue;

      const disabled = node.properties?.some(
        (p) => p.name === 'disabled' && p.value?.value === true,
      );
      const el: RawInteractable = { role, name: axString(node.name?.value) };
      const value = axString(node.value?.value);
      if (value !== '') el.value = value;
      if (disabled === true) el.disabled = true;
      if (fileInput !== null) {
        el.inputKind = 'file';
        if (fileInput.accept.length > 0) el.accept = fileInput.accept;
        if (fileInput.multiple) el.multiple = true;
      }

      elements.push(el);
      // ref is 1-based, aligned with finalizeElements
      refMap.set(elements.length, { backendNodeId: node.backendDOMNodeId });
      if (elements.length >= MAX_INTERACTABLE_ELEMENTS) break;
    }

    CdpDriver.refMaps.set(wc, refMap);
    return { url: wc.getURL(), title: wc.getTitle(), elements };
  }

  /**
   * Resolve a snapshot `ref` to a live node handle, guarding against stale refs / tab switches. The
   * a11y path returns the stored `backendNodeId`; the render-DOM path re-resolves the stored XPath to
   * a fresh object handle against the current DOM (so a `ref` stays valid within its snapshot).
   */
  private static async resolveRef(wc: WebContents, ref: number): Promise<NodeArg> {
    const refMap = CdpDriver.refMaps.get(wc);
    if (refMap === undefined) {
      throw new AppError('Element refs are stale — read the page elements again first', 409);
    }
    const target = refMap.get(ref);
    if (target === undefined) throw new AppError(`No element with ref ${String(ref)}`, 404);
    if ('backendNodeId' in target) return { backendNodeId: target.backendNodeId };
    return { objectId: await CdpDriver.pathToObjectId(wc, target.path) };
  }

  /**
   * Re-resolve a child-index `path` to a live object handle by injecting the SAME `resolveNodePath`
   * algorithm the pure layer unit-tests (via `.toString()`) into an isolated world — so shadow-DOM
   * and same-origin iframe targets resolve where XPath cannot cross. A stale path (DOM changed) yields
   * `null` → no objectId → a 409 asking the agent to re-read the page.
   */
  private static async pathToObjectId(wc: WebContents, path: NodePath): Promise<string> {
    const contextId = await CdpDriver.mainFrameIsolatedContext(wc);
    const raw: unknown = await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: `(${resolveNodePath.toString()})(document, ${JSON.stringify(path)})`,
      contextId,
      returnByValue: false,
      silent: true,
    });
    const parsed = EvalHandleSchema.safeParse(raw);
    if (!parsed.success || parsed.data.result.objectId === undefined) {
      throw new AppError('Element is no longer on the page — read the page elements again first', 409);
    }
    return parsed.data.result.objectId;
  }

  private static async fileInputInfo(
    wc: WebContents,
    node: NodeArg,
  ): Promise<{ accept: string; multiple: boolean } | null> {
    const raw: unknown = await wc.debugger.sendCommand('DOM.describeNode', { ...node, depth: 0 });
    const parsed = DescribeNodeSchema.safeParse(raw);
    if (!parsed.success) return null;
    const nodeName = (parsed.data.node.localName ?? parsed.data.node.nodeName ?? '').toLowerCase();
    if (nodeName !== 'input') return null;
    const attrs = attributesMap(parsed.data.node.attributes);
    if ((attrs.get('type') ?? '').toLowerCase() !== 'file') return null;
    return { accept: attrs.get('accept') ?? '', multiple: attrs.has('multiple') };
  }

  static async setFileInputFiles(
    wc: WebContents,
    ref: number,
    paths: string[],
  ): Promise<{ accept: string; multiple: boolean }> {
    await CdpDriver.ensureAttached(wc);
    const node = await CdpDriver.resolveRef(wc, ref);
    const info = await CdpDriver.fileInputInfo(wc, node);
    if (info === null) throw new AppError('Target element is not a file input', 409);
    if (!info.multiple && paths.length > 1) {
      throw new AppError('Target file input does not accept multiple files', 409);
    }
    await wc.debugger.sendCommand('DOM.setFileInputFiles', { ...node, files: paths });
    await CdpDriver.settle(wc);
    return info;
  }

  /** The center point (CSS px, viewport-relative) of an element, after scrolling it into view. */
  private static async centerOf(
    wc: WebContents,
    node: NodeArg,
  ): Promise<{ x: number; y: number }> {
    await wc.debugger
      .sendCommand('DOM.scrollIntoViewIfNeeded', { ...node })
      .catch(() => undefined); // best-effort; getBoxModel below is the real guard
    const raw: unknown = await wc.debugger.sendCommand('DOM.getBoxModel', { ...node });
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
    const node = await CdpDriver.resolveRef(wc, ref);
    const { x, y } = await CdpDriver.centerOf(wc, node);
    if (adapter === undefined) {
      const base = { x, y, button: 'left' as const, clickCount: 1 };
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    } else {
      await adapter.idle(); // human think/react pause between behaviors
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
    const node = await CdpDriver.resolveRef(wc, ref);
    const { x, y } = await CdpDriver.centerOf(wc, node);
    if (adapter === undefined) {
      // Background-tab teleport fallback (no visible cursor): programmatic focus is acceptable here.
      await wc.debugger.sendCommand('DOM.focus', { ...node });
      // Select any existing value (Ctrl+A) so the insert replaces it, then type the new text.
      await CdpDriver.sendKey(wc, { key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
      await wc.debugger.sendCommand('Input.insertText', { text });
    } else {
      // Active tab: focus the field with a REAL trusted click (never DOM.focus). If the click lands
      // on something covering the center, verify focus and retry — recomputing the box in case the
      // layout shifted (e.g. an overlay dismissed on the first click).
      await adapter.idle(); // human think/react pause between behaviors
      let target = { x, y };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await adapter.idle(200, 70);
          target = await CdpDriver.centerOf(wc, node);
        }
        await adapter.click(target.x, target.y);
        if (await CdpDriver.isFocused(wc, node)) break;
      }
      await adapter.idle(200, 70); // beat: click -> select-all
      // Ctrl+A with a text-less KeySpec => rawKeyDown, so it fires the accelerator without typing 'a'.
      await adapter.pressKey({ key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
      await adapter.idle(200, 70); // beat: select-all -> type
      await adapter.insertText(text);
    }
    await CdpDriver.settle(wc);
  }

  /** True when the target node (or a descendant) is the document's active/focused element. */
  private static async isFocused(wc: WebContents, node: NodeArg): Promise<boolean> {
    let objectId: string;
    if ('objectId' in node) {
      objectId = node.objectId;
    } else {
      const resolved: unknown = await wc.debugger
        .sendCommand('DOM.resolveNode', { backendNodeId: node.backendNodeId })
        .catch(() => null);
      const parsed = ResolveSchema.safeParse(resolved);
      if (!parsed.success) return false;
      objectId = parsed.data.object.objectId;
    }
    const raw: unknown = await wc.debugger
      .sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration:
          'function(){return this===document.activeElement||this.contains(document.activeElement);}',
        returnByValue: true,
      })
      .catch(() => null);
    const r = CallResultSchema.safeParse(raw);
    return r.success && r.data.result.value === true;
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
      await adapter.idle(); // human think/react pause between behaviors
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
    } else {
      await adapter.idle(); // human think/react pause between behaviors
      await adapter.scroll(direction, amount);
    }
    await CdpDriver.settle(wc);
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

  /** Wait for a load triggered by an interaction to settle, then network and DOM quiescence. */
  static async waitForPageSettled(wc: WebContents, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
    if (wc.isDestroyed()) return;
    await CdpDriver.ensureAttached(wc);
    const deadline = Date.now() + timeoutMs;
    if (wc.isLoadingMainFrame()) {
      await CdpDriver.waitForLoadStop(wc, timeoutMs);
    }
    if (wc.isDestroyed()) return;

    const remaining = (): number => Math.max(SETTLE_MS, deadline - Date.now());
    await CdpDriver.waitForNetworkIdle(wc, SETTLE_MS, remaining()).catch(() => undefined);
    if (wc.isDestroyed()) return;
    await CdpDriver.waitForDomQuiet(wc, SETTLE_MS, remaining()).catch(() => delay(SETTLE_MS));
  }

  /** Wait for a load triggered by an interaction to settle. */
  private static async settle(wc: WebContents): Promise<void> {
    await CdpDriver.waitForPageSettled(wc);
  }

  private static async waitForLoadStop(wc: WebContents, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      wc.once('did-stop-loading', done);
    });
  }

  private static async waitForNetworkIdle(
    wc: WebContents,
    quietMs: number,
    timeoutMs: number,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    await new Promise<void>((resolve) => {
      const inflight = new Set<string>();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let onMessage: (_e: unknown, method: string, params?: unknown) => void = () => undefined;

      const done = (): void => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        if (!wc.isDestroyed()) {
          wc.debugger.removeListener('message', onMessage);
          wc.removeListener('destroyed', done);
        }
        resolve();
      };
      const scheduleIdle = (): void => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        if (inflight.size === 0) idleTimer = setTimeout(done, quietMs);
      };
      onMessage = (_e: unknown, method: string, params?: unknown): void => {
        if (method === 'Network.requestWillBeSent') {
          const parsed = NetworkRequestSchema.safeParse(params);
          if (!parsed.success) return;
          if (parsed.data.type === 'WebSocket' || parsed.data.type === 'EventSource') return;
          inflight.add(parsed.data.requestId);
          if (idleTimer !== null) clearTimeout(idleTimer);
          return;
        }
        if (method !== 'Network.loadingFinished' && method !== 'Network.loadingFailed') return;
        const parsed = NetworkCompleteSchema.safeParse(params);
        if (!parsed.success) return;
        inflight.delete(parsed.data.requestId);
        scheduleIdle();
      };

      wc.debugger.on('message', onMessage);
      wc.once('destroyed', done);
      timeoutTimer = setTimeout(done, timeoutMs);
      scheduleIdle();
    });
  }

  private static async waitForDomQuiet(
    wc: WebContents,
    quietMs: number,
    timeoutMs: number,
  ): Promise<void> {
    await CdpDriver.ensureAttached(wc);
    const contextId = await CdpDriver.mainFrameIsolatedContext(wc);
    const quiet = Math.max(0, Math.trunc(quietMs));
    const timeout = Math.max(quiet, Math.trunc(timeoutMs));
    await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: `(() => new Promise((resolve) => {
        const quietMs = ${String(quiet)};
        const timeoutMs = ${String(timeout)};
        const root = document.documentElement || document.body;
        if (!root || typeof MutationObserver === 'undefined') {
          setTimeout(() => resolve('no-dom'), quietMs);
          return;
        }
        let observer = null;
        let quietTimer = 0;
        let timeoutTimer = 0;
        const finish = (reason) => {
          clearTimeout(quietTimer);
          clearTimeout(timeoutTimer);
          if (observer !== null) observer.disconnect();
          resolve(reason);
        };
        observer = new MutationObserver(() => {
          clearTimeout(quietTimer);
          quietTimer = setTimeout(() => finish('quiet'), quietMs);
        });
        observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
        timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);
        quietTimer = setTimeout(() => finish('quiet'), quietMs);
      }))()`,
      contextId,
      awaitPromise: true,
      returnByValue: true,
      silent: true,
    });
  }

  private static async mainFrameIsolatedContext(wc: WebContents): Promise<number> {
    const frameTreeRaw: unknown = await wc.debugger.sendCommand('Page.getFrameTree');
    const frameTree = FrameTreeSchema.safeParse(frameTreeRaw);
    if (!frameTree.success) throw new AppError('Failed to resolve the page frame for settling', 502);
    const worldRaw: unknown = await wc.debugger.sendCommand('Page.createIsolatedWorld', {
      frameId: frameTree.data.frameTree.frame.id,
      worldName: 'tepegoz-page-stability',
      grantUniveralAccess: false,
    });
    const world = IsolatedWorldSchema.safeParse(worldRaw);
    if (!world.success) throw new AppError('Failed to create an isolated settling context', 502);
    return world.data.executionContextId;
  }
}
