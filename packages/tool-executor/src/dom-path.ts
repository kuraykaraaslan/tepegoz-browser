/**
 * Frame/shadow-aware node addressing for render-DOM perception (AI-2 PR2b). XPath cannot cross shadow
 * or iframe boundaries, so an element inside an open shadow root or a same-origin iframe is addressed
 * by a **child-index path**: an array of segments, each segment a list of `.children[i]` steps within
 * one root, with a boundary crossing (shadow root or iframe `contentDocument`) between consecutive
 * segments. The perception script builds these paths; the driver re-resolves them at action time.
 *
 * This resolver is deliberately **DOM-free** — it walks a duck-typed `PathNode` shape that real DOM
 * `Document`/`Element`/`ShadowRoot` nodes satisfy. That keeps it in the pure, unit-testable layer (no
 * DOM lib in the privileged main process) AND lets the driver inject the *same* algorithm into the
 * page via `resolveNodePath.toString()`, so what we test is exactly what runs. Self-contained: it
 * references no module scope, so `.toString()` yields a valid standalone expression.
 */

/** The minimal shape the resolver needs — satisfied by DOM `Document`, `Element`, and `ShadowRoot`. */
export interface PathNode {
  readonly children: ArrayLike<PathNode>;
  /** Open shadow root, when the node hosts one (closed roots read as null and are unreachable). */
  readonly shadowRoot?: PathNode | null;
  /** Same-origin iframe document (cross-origin reads as null and is unreachable). */
  readonly contentDocument?: PathNode | null;
  /** Upper-case tag name; only `IFRAME` is consulted, to pick the frame-crossing over shadow. */
  readonly tagName?: string;
}

/** One segment: the `.children[i]` steps to a node within the current root. */
export type PathSegment = readonly number[];
/** A full address: segments joined by shadow/iframe boundary crossings. */
export type NodePath = readonly PathSegment[];

/**
 * Walk `path` from `root`, crossing into a node's shadow root (preferred) or same-origin iframe
 * document between segments. Returns the addressed node, or `null` if any step is missing (a stale
 * path after the DOM changed) — the driver treats null as "read the page again".
 */
export function resolveNodePath(root: PathNode, path: NodePath): PathNode | null {
  let cur: PathNode | null = root;
  let el: PathNode | null = null;
  for (let s = 0; s < path.length; s++) {
    if (cur === null) return null;
    const seg = path[s];
    if (seg === undefined || seg.length === 0) return null;
    let node: PathNode | null = cur.children[seg[0]!] ?? null;
    for (let k = 1; k < seg.length && node !== null; k++) node = node.children[seg[k]!] ?? null;
    if (node === null) return null;
    el = node;
    if (s < path.length - 1) {
      cur =
        (el.shadowRoot ?? null) ??
        (el.tagName === 'IFRAME' ? (el.contentDocument ?? null) : null);
    }
  }
  return el;
}
