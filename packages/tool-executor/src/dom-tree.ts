import { MAX_INTERACTABLE_ELEMENTS, type RawInteractable } from './interactable.js';

/**
 * Pure typed model for the render-DOM perception (AI-2). The in-page `buildDomTree` script walks the
 * rendered DOM — deciding interactivity from computed `cursor`/tag/role, visibility from box geometry,
 * and occlusion via `elementFromPoint` — and returns a flat, serializable list of the **indexable**
 * elements (interactive + visible + on-top + in-viewport) already in document order. This module turns
 * that untrusted, already-CDP-validated payload into the `RawInteractable[]` the perception pipeline
 * sanitizes, plus the parallel `xpath` selector list the driver resolves back to a node for clicking.
 *
 * Kept Electron-free and pure so it is unit-testable. The zod trust boundary lives at the CDP read site
 * (the driver), exactly like the accessibility-tree path — this layer is total and defensive.
 */

/** One indexable element as emitted by the in-page `buildDomTree` script (page-controlled, untrusted). */
export interface DomTreeNode {
  /** Lower-cased HTML tag name (`a`, `button`, `div`, …). */
  tag: string;
  /** Absolute XPath from the document root — the stable handle the driver re-resolves to a node. */
  xpath: string;
  /** ARIA role: explicit `role=` attribute, else a coarse role derived from the tag. May be ''. */
  role: string;
  /** Visible text (own + descendant, collapsed + capped by the script). */
  name: string;
  /** Anchor destination (resolved absolute URL) when the element is a link. */
  href?: string | undefined;
  /** Current value for form controls. */
  value?: string | undefined;
  /** True when the control is disabled. */
  disabled?: boolean | undefined;
  /** Allow-listed page attributes captured by the script (keys already lower-cased). */
  attributes?: Record<string, string> | undefined;
  /** `type` of an `<input>` — `file` promotes the node to a file-picker action. */
  inputType?: string | undefined;
  /** File input `accept` filter (page-declared, advisory). */
  accept?: string | undefined;
  /** True when a file input accepts multiple files. */
  multiple?: boolean | undefined;
}

/** The whole in-page perception result: page identity plus the ordered indexable node list. */
export interface DomTreeResult {
  url: string;
  title: string;
  nodes: DomTreeNode[];
}

/** The driver-facing parse: sanitizable raw nodes plus the aligned XPath selector map (by ref-1). */
export interface ParsedDomTree {
  /** Raw interactable nodes in ref order (ref = index + 1); feed straight to `finalizeElements`. */
  interactables: RawInteractable[];
  /** `xpaths[i]` targets the element at ref `i + 1` — the driver's `selectorMap`. */
  xpaths: string[];
}

/** Map one validated DOM-tree node to a raw interactable, deriving the file-input action. */
function toRawInteractable(node: DomTreeNode): RawInteractable {
  const raw: RawInteractable = { role: node.role, name: node.name, tag: node.tag };
  if (node.href !== undefined && node.href.length > 0) raw.href = node.href;
  if (node.value !== undefined && node.value.length > 0) raw.value = node.value;
  if (node.disabled === true) raw.disabled = true;
  if (node.attributes !== undefined && Object.keys(node.attributes).length > 0) {
    raw.attributes = node.attributes;
  }
  if ((node.inputType ?? '').toLowerCase() === 'file') {
    raw.inputKind = 'file';
    if (node.accept !== undefined && node.accept.length > 0) raw.accept = node.accept;
    if (node.multiple === true) raw.multiple = true;
  }
  return raw;
}

/**
 * Turn the (CDP-validated) render-DOM result into ref-ordered raw interactables + the aligned XPath
 * selector map. Capped to {@link MAX_INTERACTABLE_ELEMENTS} so the two arrays stay aligned with the
 * refs `finalizeElements` assigns.
 */
export function parseDomTree(result: DomTreeResult): ParsedDomTree {
  const nodes = result.nodes.slice(0, MAX_INTERACTABLE_ELEMENTS);
  return {
    interactables: nodes.map(toRawInteractable),
    xpaths: nodes.map((n) => n.xpath),
  };
}
