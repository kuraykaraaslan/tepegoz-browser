import { z } from 'zod';
import type { WebContents } from 'electron';
import type { ElementLocators, NodePath, RawInteractable, RefRegistry } from '@tepegoz/tool-executor';

/**
 * Shared primitives for the {@link CdpDriver} facade: the trust-boundary zod schemas, the injected
 * page-script constants, small pure coercers, and the collaborator types the extracted helper modules
 * pass around. Kept in one dependency-free module so the concern-specific siblings and the driver class
 * can all import from it without cycles.
 */

/** How long to wait for a load to settle before giving up (navigation/click-triggered nav). */
export const LOAD_TIMEOUT_MS = 15_000;
/** Quiet period after load/interaction for the DOM to settle before the next perception. */
export const SETTLE_MS = 350;
/** Default wheel delta for a scroll step (~one viewport-ish nudge in CSS px). */
export const DEFAULT_SCROLL_PX = 600;

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
export const AxTreeSchema = z.object({ nodes: z.array(AxNodeSchema) });

export const BoxModelSchema = z.object({ model: z.object({ content: z.array(z.number()) }) });
export const DescribeNodeSchema = z.object({
  node: z.object({
    localName: z.string().optional(),
    nodeName: z.string().optional(),
    attributes: z.array(z.string()).optional(),
  }),
});
export const FrameTreeSchema = z
  .object({
    frameTree: z.object({ frame: z.object({ id: z.string() }).passthrough() }).passthrough(),
  })
  .passthrough();
export const IsolatedWorldSchema = z
  .object({ executionContextId: z.number().int().nonnegative() })
  .passthrough();
/**
 * `Network.requestWillBeSent`. `requestId`/`type` drive network-idle accounting; `request` and
 * `redirectResponse` feed the AI-8B response recorder — both OPTIONAL so a payload shaped slightly
 * differently by a Chromium revision degrades the recorder rather than breaking idle waiting.
 */
export const NetworkRequestSchema = z
  .object({
    requestId: z.string(),
    type: z.string().optional(),
    request: z.object({ method: z.string().optional(), url: z.string().optional() }).passthrough().optional(),
    redirectResponse: z.object({ status: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();
export const NetworkCompleteSchema = z.object({ requestId: z.string() }).passthrough();
/** `Network.responseReceived` — the event carrying the HTTP status (AI-8B). */
export const NetworkResponseSchema = z
  .object({
    requestId: z.string(),
    type: z.string().optional(),
    response: z.object({ url: z.string(), status: z.number() }).passthrough(),
  })
  .passthrough();
/** `Network.loadingFailed` — a request that produced no response at all (DNS/refused/blocked). */
export const NetworkFailedSchema = z
  .object({
    requestId: z.string(),
    type: z.string().optional(),
    errorText: z.string().optional(),
    canceled: z.boolean().optional(),
    /** Set when the BROWSER refused the request (adblock/CSP/mixed-content/extension) — not a server
     *  failure, and never the agent's action failing. */
    blockedReason: z.string().optional(),
  })
  .passthrough();
export const ResolveSchema = z.object({ object: z.object({ objectId: z.string() }).passthrough() });
export const CallResultSchema = z.object({ result: z.object({ value: z.unknown() }).passthrough() });
/** `Runtime.callFunctionOn` returnByValue envelope for {@link SELECT_OPTION_FN}. */
export const SelectResultSchema = z.object({
  result: z.object({
    value: z.object({ selected: z.string().nullable(), options: z.array(z.string()) }),
  }),
});
/**
 * Runs ON a native `<select>` node (or a wrapper containing one): finds the option matching `value` by
 * text/label/value — exact, then diacritic-insensitive (NFKD), then substring — sets it and fires
 * `input`+`change` so page scripts react. Returns the matched option's label (or null) + all labels.
 * A native select opens an OS popup that synthetic clicks can't drive, so this is the deterministic path.
 */
export const SELECT_OPTION_FN =
  'function(value){' +
  'var el=this;' +
  "if(!el||el.tagName!=='SELECT'){el=(el&&el.querySelector)?el.querySelector('select'):null;}" +
  'if(!el){return {selected:null,options:[]};}' +
  'var opts=Array.prototype.slice.call(el.options||[]);' +
  "var label=function(o){return String(o.label||o.textContent||o.value||'').trim();};" +
  'var labels=opts.map(label);' +
  "var norm=function(s){return String(s==null?'':s).normalize('NFKD').replace(/\\p{Diacritic}/gu,'').trim().toLowerCase();};" +
  'var want=String(value).trim().toLowerCase();var wantN=norm(value);' +
  "var exact=function(o){return String(o.textContent||'').trim().toLowerCase()===want||String(o.label||'').trim().toLowerCase()===want||String(o.value||'').trim().toLowerCase()===want;};" +
  'var diac=function(o){return norm(o.textContent)===wantN||norm(o.label)===wantN||norm(o.value)===wantN;};' +
  'var sub=function(o){return wantN.length>0&&norm(o.textContent).indexOf(wantN)>=0;};' +
  'var found=opts.find(exact)||opts.find(diac)||opts.find(sub);' +
  'if(!found){return {selected:null,options:labels};}' +
  'el.value=found.value;el.selectedIndex=found.index;' +
  "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));" +
  'return {selected:label(found),options:labels};' +
  '}';
/** Runtime.evaluate result envelope when we ask for a handle (not by-value). */
export const EvalHandleSchema = z.object({
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
export const DomTreeResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  nodes: z.array(DomTreeNodeSchema),
});

/** The click-point probe result (S3 PR5): where to click, and what covers it when nothing is free. */
export const ClickPointSchema = z.object({
  result: z.object({
    value: z.object({
      x: z.number(),
      y: z.number(),
      blocker: z.string().nullable(),
    }),
  }),
});

/** Which kind of widget-driven field this is, if any (S3 PR7). */
export const WidgetKindSchema = z.object({
  result: z.object({
    value: z.object({ kind: z.enum(['readonly', 'disabled', 'combobox']).nullable() }),
  }),
});

/** CDP key-event fields for one named key. */
export type KeySpec = { key: string; code: string; keyCode: number; text?: string };

/** A named key the agent can press → CDP key-event fields. */
export const KEY_MAP: Record<string, KeySpec> = {
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

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How a snapshot `ref` maps back to a DOM node. The accessibility path resolves directly by
 * `backendNodeId`; the render-DOM path (AI-2) stores a child-index `path` (crossing shadow/iframe
 * boundaries) re-resolved lazily at action time (keeps a snapshot cheap — only the acted-on element
 * is resolved).
 */
export type RefTarget =
  | { backendNodeId: number }
  | {
      path: NodePath;
      /**
       * S3 PR5: the identity this ref can be re-found by when its path goes stale. One locator per ref
       * meant a miss cost a full re-snapshot — which renumbers every positional ref and takes the model's
       * plan with it. Absent on the a11y fallback, which carries no such fields.
       */
      locators?: ElementLocators;
    };
/** A node handle any DOM.* command accepts — either an existing backend id or a live object handle. */
export type NodeArg = { backendNodeId: number } | { objectId: string };

/** The read result every perception path returns. */
export type SnapshotResult = { url: string; title: string; elements: RawInteractable[] };

/** Attach + enable the domains we need on `wc` (re-attaching if the active tab changed). */
export type EnsureAttached = (wc: WebContents) => Promise<void>;

/** State-owning collaborators the driver class lends to the extracted input helpers. */
export interface DriverCore {
  ensure: EnsureAttached;
  resolveRef: (wc: WebContents, ref: number) => Promise<NodeArg>;
  settle: (wc: WebContents) => Promise<void>;
  /**
   * S4 PR2: refuse a state-changing action when the page changed ORIGIN since the ref was located.
   *
   * A ref is found on one page and acted on a moment later. If the page was replaced in between, the
   * gesture lands somewhere the agent never looked — a look-alike page can accept a transfer and print a
   * confirmation, and nothing in the DOM layer would know. Deterministic and pre-model (ADR-0006's
   * spirit): no prose decides this.
   */
  assertSameOrigin: (wc: WebContents) => void;
}

/** Per-tab snapshot state the driver class lends to the extracted perception helpers. */
export interface SnapshotDeps {
  ensure: EnsureAttached;
  refMaps: WeakMap<WebContents, Map<number, RefTarget>>;
  prevSnapshots: WeakMap<WebContents, { url: string; hashes: Set<string> }>;
  /** S4 PR2: the page URL each tab's ref map was built against, so a later action can prove a swap. */
  refOrigins: WeakMap<WebContents, string>;
  /**
   * S2 PR1: per-tab identity → ref carry-over, so an element keeps its number across snapshots within a
   * run. Present only when `TEPEGOZ_PERCEPTION_V2` is on; the positional path never reads it.
   */
  refRegistries: WeakMap<WebContents, RefRegistry>;
}

/** The AX-node value coerced to a trimmed string, or '' when absent/non-scalar. */
export function axString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function attributesMap(attrs: string[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (attrs === undefined) return map;
  for (let i = 0; i < attrs.length; i += 2) {
    const key = attrs[i];
    if (key !== undefined) map.set(key.toLowerCase(), attrs[i + 1] ?? '');
  }
  return map;
}
