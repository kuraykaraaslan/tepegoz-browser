import { z } from 'zod';
import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';
import type { Selector, SelectorChain } from '@tepegoz/shared-types';
import { HumanInputAdapter } from '@tepegoz/human-input';
import { KEY_MAP, toQuery } from '@tepegoz/ext-macros/cdp-selectors';

/**
 * Deterministic **selector engine** for the macro runtime (the direct answer to iMacros' static
 * `TAG POS` breaking on React/dynamic DOMs). Drives the active tab over the same out-of-process CDP
 * channel as the agent's `CdpDriver`, but resolves a **SelectorChain** — an ordered list of CSS /
 * XPath / text / attribute candidates — with **auto-wait polling** (poll until one resolves or the
 * timeout elapses) rather than a fixed sleep. Actions dispatch real user input at the element box, so
 * they can't be observed/tampered with by page JS. Shares the single `webContents.debugger`
 * attachment with `CdpDriver` (only one may run at a time; enabling a domain twice is idempotent).
 *
 * The pure selector→CDP-query translation + key table live in `@tepegoz/ext-macros/cdp-selectors`;
 * this file is the Electron/CDP wiring around them.
 */

const POLL_MS = 150;
const DEFAULT_WAIT_MS = 10_000;

const NodeIdSchema = z.object({ nodeId: z.number() }).passthrough();
const DescribeSchema = z.object({ node: z.object({ backendNodeId: z.number() }).passthrough() });
const SearchSchema = z.object({ searchId: z.string(), resultCount: z.number() });
const SearchResultsSchema = z.object({ nodeIds: z.array(z.number()) });
const BoxModelSchema = z.object({ model: z.object({ content: z.array(z.number()) }) });
const ResolveSchema = z.object({ object: z.object({ objectId: z.string() }).passthrough() });
const CallResultSchema = z.object({ result: z.object({ value: z.unknown() }).passthrough() });

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default class MacroCdp {
  /** Ensure the debugger is attached + the domains we use are enabled (idempotent, shared with CdpDriver). */
  private static async ensure(wc: WebContents): Promise<void> {
    if (!wc.debugger.isAttached()) {
      try {
        wc.debugger.attach('1.3');
      } catch (err) {
        throw new AppError(`Cannot drive the page (DevTools open?): ${String(err)}`, 409);
      }
    }
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('DOM.getDocument', { depth: -1 });
  }

  /** Resolve one selector to a backendNodeId once (no waiting), or null if it doesn't match now. */
  private static async resolveOnce(wc: WebContents, sel: Selector): Promise<number | null> {
    const { method, query } = toQuery(sel);
    let nodeId = 0;
    if (method === 'css') {
      const docRaw: unknown = await wc.debugger.sendCommand('DOM.getDocument', { depth: 0 });
      const root = z.object({ root: NodeIdSchema }).safeParse(docRaw);
      if (!root.success) return null;
      const raw: unknown = await wc.debugger
        .sendCommand('DOM.querySelector', { nodeId: root.data.root.nodeId, selector: query })
        .catch(() => null);
      const parsed = NodeIdSchema.safeParse(raw);
      nodeId = parsed.success ? parsed.data.nodeId : 0;
    } else {
      const searchRaw: unknown = await wc.debugger
        .sendCommand('DOM.performSearch', { query, includeUserAgentShadowDOM: false })
        .catch(() => null);
      const search = SearchSchema.safeParse(searchRaw);
      if (!search.success || search.data.resultCount === 0) return null;
      const resultsRaw: unknown = await wc.debugger.sendCommand('DOM.getSearchResults', {
        searchId: search.data.searchId,
        fromIndex: 0,
        toIndex: 1,
      });
      await wc.debugger
        .sendCommand('DOM.discardSearchResults', { searchId: search.data.searchId })
        .catch(() => undefined);
      const results = SearchResultsSchema.safeParse(resultsRaw);
      nodeId = results.success ? (results.data.nodeIds[0] ?? 0) : 0;
    }
    if (nodeId === 0) return null;
    const descRaw: unknown = await wc.debugger
      .sendCommand('DOM.describeNode', { nodeId })
      .catch(() => null);
    const desc = DescribeSchema.safeParse(descRaw);
    return desc.success ? desc.data.node.backendNodeId : null;
  }

  /**
   * Resolve a SelectorChain with auto-wait: poll every {@link POLL_MS} until the FIRST candidate (in
   * order) resolves, or `timeoutMs` elapses. Returns the winning backendNodeId, or null on timeout.
   */
  static async resolveChain(
    wc: WebContents,
    chain: SelectorChain,
    timeoutMs = DEFAULT_WAIT_MS,
  ): Promise<number | null> {
    await MacroCdp.ensure(wc);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (const sel of chain) {
        const id = await MacroCdp.resolveOnce(wc, sel);
        if (id !== null) return id;
      }
      if (Date.now() >= deadline) return null;
      await delay(POLL_MS);
    }
  }

  private static async centerOf(
    wc: WebContents,
    backendNodeId: number,
  ): Promise<{ x: number; y: number }> {
    await wc.debugger
      .sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId })
      .catch(() => undefined);
    const raw: unknown = await wc.debugger.sendCommand('DOM.getBoxModel', { backendNodeId });
    const box = BoxModelSchema.safeParse(raw);
    if (!box.success || box.data.model.content.length < 8) {
      throw new AppError('Element is not visible/clickable', 409);
    }
    const q = box.data.model.content;
    return { x: (q[0]! + q[2]! + q[4]! + q[6]!) / 4, y: (q[1]! + q[3]! + q[5]! + q[7]!) / 4 };
  }

  static async click(
    wc: WebContents,
    backendNodeId: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    const { x, y } = await MacroCdp.centerOf(wc, backendNodeId);
    if (adapter === undefined) {
      const base = { x, y, button: 'left' as const, clickCount: 1 };
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    } else {
      await adapter.idle(); // human think/react pause between behaviors
      await adapter.click(x, y);
    }
  }

  static async fill(
    wc: WebContents,
    backendNodeId: number,
    text: string,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    const { x, y } = await MacroCdp.centerOf(wc, backendNodeId);
    if (adapter === undefined) {
      // No visible cursor: programmatic focus + select-all + insert is acceptable.
      await wc.debugger.sendCommand('DOM.focus', { backendNodeId });
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        modifiers: 2,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
      });
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers: 2,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
      });
      await wc.debugger.sendCommand('Input.insertText', { text });
    } else {
      // Focus the field with a REAL trusted click (never DOM.focus); verify + retry on a covered box.
      await adapter.idle(); // human think/react pause between behaviors
      let target = { x, y };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await adapter.idle(200, 70);
          target = await MacroCdp.centerOf(wc, backendNodeId);
        }
        await adapter.click(target.x, target.y);
        if (await MacroCdp.isFocused(wc, backendNodeId)) break;
      }
      await adapter.idle(200, 70); // beat: click -> select-all
      // Text-less KeySpec => rawKeyDown, so Ctrl+A fires the accelerator without typing 'a'.
      await adapter.pressKey({ key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
      await adapter.idle(200, 70); // beat: select-all -> type
      await adapter.insertText(text);
    }
  }

  /** True when `backendNodeId` (or a descendant) is the document's active/focused element. */
  private static async isFocused(wc: WebContents, backendNodeId: number): Promise<boolean> {
    const resolvedRaw: unknown = await wc.debugger
      .sendCommand('DOM.resolveNode', { backendNodeId })
      .catch(() => null);
    const resolved = ResolveSchema.safeParse(resolvedRaw);
    if (!resolved.success) return false;
    const raw: unknown = await wc.debugger
      .sendCommand('Runtime.callFunctionOn', {
        objectId: resolved.data.object.objectId,
        functionDeclaration:
          'function(){return this===document.activeElement||this.contains(document.activeElement);}',
        returnByValue: true,
      })
      .catch(() => null);
    const parsed = CallResultSchema.safeParse(raw);
    return parsed.success && parsed.data.result.value === true;
  }

  /** Read the element's text, or a named attribute, by calling a function ON that specific node. */
  static async extract(wc: WebContents, backendNodeId: number, attr?: string): Promise<string> {
    const resolvedRaw: unknown = await wc.debugger.sendCommand('DOM.resolveNode', {
      backendNodeId,
    });
    const resolved = ResolveSchema.safeParse(resolvedRaw);
    if (!resolved.success) return '';
    const fn =
      attr === undefined
        ? 'function() { return this.innerText || this.textContent || ""; }'
        : 'function(a) { return this.getAttribute(a) || ""; }';
    const raw: unknown = await wc.debugger.sendCommand('Runtime.callFunctionOn', {
      objectId: resolved.data.object.objectId,
      functionDeclaration: fn,
      arguments: attr === undefined ? [] : [{ value: attr }],
      returnByValue: true,
    });
    const parsed = CallResultSchema.safeParse(raw);
    const value = parsed.success ? parsed.data.result.value : '';
    return typeof value === 'string' ? value : '';
  }

  static async highlight(wc: WebContents, backendNodeId: number): Promise<void> {
    await wc.debugger.sendCommand('Overlay.enable').catch(() => undefined);
    await wc.debugger
      .sendCommand('Overlay.highlightNode', {
        highlightConfig: {
          contentColor: { r: 111, g: 168, b: 220, a: 0.4 },
          borderColor: { r: 40, g: 120, b: 200, a: 1 },
        },
        backendNodeId,
      })
      .catch(() => undefined);
  }

  static async hideHighlight(wc: WebContents): Promise<void> {
    await wc.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
  }

  static async pressKey(wc: WebContents, key: string, adapter?: HumanInputAdapter): Promise<void> {
    const spec = KEY_MAP[key];
    if (spec === undefined) throw new AppError(`Unsupported key: ${key}`, 400);
    if (adapter === undefined) {
      const common = {
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
    } else {
      await adapter.idle(); // human think/react pause between behaviors
      await adapter.pressKey(spec);
    }
  }

  static async scroll(
    wc: WebContents,
    direction: 'up' | 'down',
    amount?: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    if (adapter === undefined) {
      const deltaY = (direction === 'down' ? 1 : -1) * (amount ?? 600);
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
  }
}
