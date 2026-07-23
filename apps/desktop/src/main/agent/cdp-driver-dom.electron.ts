import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';
import { resolveNodePath, type NodePath } from '@tepegoz/tool-executor';
import {
  attributesMap,
  BoxModelSchema,
  CallResultSchema,
  DescribeNodeSchema,
  EvalHandleSchema,
  ResolveSchema,
  type NodeArg,
} from './cdp-driver-schemas.electron.js';
import { mainFrameIsolatedContext } from './cdp-driver-session.electron.js';

/**
 * DOM query/resolution concern for {@link CdpDriver}: describing a node, locating its on-screen box,
 * resolving a backend id (or child-index path) to a live object handle, and focus checks. Every helper
 * takes the live `WebContents` and the already-resolved node handle — no driver state involved.
 */

export async function fileInputInfo(
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

/** The center point (CSS px, viewport-relative) of an element, after scrolling it into view. */
export async function centerOf(
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

/** Resolve a {@link NodeArg} to a live `objectId` (needed by `Runtime.callFunctionOn`). */
export async function objectIdFor(wc: WebContents, node: NodeArg): Promise<string> {
  if ('objectId' in node) return node.objectId;
  const resolved: unknown = await wc.debugger.sendCommand('DOM.resolveNode', {
    backendNodeId: node.backendNodeId,
  });
  const parsed = ResolveSchema.safeParse(resolved);
  if (!parsed.success) throw new AppError('could not resolve node for select_option', 409);
  return parsed.data.object.objectId;
}

/** Longest field value read back — a textarea can hold megabytes; the agent needs only the head of it. */
const MAX_VALUE_CHARS = 2_000;

/**
 * Read back the CURRENT value of a form control so a `fill` can be VERIFIED instead of assumed.
 *
 * Returns `null` when the node has no value semantics (a div/button) or the read fails — deliberately
 * NOT an empty string, so the caller can tell "this is not a field" from "this field is empty" and
 * report an unverified fill honestly instead of inventing a result.
 */
export async function readValue(wc: WebContents, node: NodeArg): Promise<string | null> {
  const objectId = await objectIdFor(wc, node).catch(() => null);
  if (objectId === null) return null;
  const raw: unknown = await wc.debugger
    .sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration:
        'function(){' +
        'var el=this;' +
        'if(!el)return null;' +
        "if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT')return String(el.value==null?'':el.value);" +
        "if(el.isContentEditable===true)return String(el.textContent==null?'':el.textContent);" +
        'return null;}',
      returnByValue: true,
    })
    .catch(() => null);
  const parsed = CallResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data.result.value;
  return typeof value === 'string' ? value.slice(0, MAX_VALUE_CHARS) : null;
}

/** True when the target node (or a descendant) is the document's active/focused element. */
export async function isFocused(wc: WebContents, node: NodeArg): Promise<boolean> {
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

/**
 * Re-resolve a child-index `path` to a live object handle by injecting the SAME `resolveNodePath`
 * algorithm the pure layer unit-tests (via `.toString()`) into an isolated world — so shadow-DOM
 * and same-origin iframe targets resolve where XPath cannot cross. A stale path (DOM changed) yields
 * `null` → no objectId → a 409 asking the agent to re-read the page.
 */
export async function pathToObjectId(wc: WebContents, path: NodePath): Promise<string> {
  const contextId = await mainFrameIsolatedContext(wc);
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
