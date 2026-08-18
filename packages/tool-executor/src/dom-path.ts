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

/**
 * The identity a stale ref can be re-found by (S3 PR5). Recorded at snapshot time alongside the path,
 * from the same fields the S2 identity key is built from — so the cascade re-finds *that* element, not
 * merely something plausible in the same place.
 */
export interface ElementLocators {
  /** Lower-case tag name. */
  tag: string;
  /** ARIA role (explicit or derived). May be ''. */
  role: string;
  /** Accessible name as the scan resolved it. May be ''. */
  name: string;
}

/**
 * Re-find an element by identity when its child-index path no longer resolves (S3 PR5).
 *
 * One locator per ref meant a stale path cost a full re-snapshot — and a re-snapshot renumbers every
 * positional ref, so the model's whole plan goes with it. This is the cheaper second attempt.
 *
 * **It refuses to guess.** A match must agree on tag, role AND name, and there must be exactly ONE such
 * element: two identical controls are indistinguishable here for the same reason they are to a reader,
 * and clicking a wrong-but-plausible element is worse than admitting the ref is stale. Returns null on
 * no match and on ambiguity alike; the caller then re-snapshots, which is now the last resort rather
 * than the first.
 *
 * Self-contained (no module scope) so the driver can inject it with `.toString()` — what runs in the
 * page is exactly what is unit-tested here.
 */
export function findByLocators(root: PathNode, locators: ElementLocators): PathNode | null {
  const wanted = {
    tag: locators.tag.toLowerCase(),
    role: locators.role.toLowerCase(),
    name: locators.name.trim(),
  };
  const matches: PathNode[] = [];
  const CAP = 8000;
  let seen = 0;

  const nameOf = (el: Record<string, unknown>): string => {
    const get = el['getAttribute'] as ((n: string) => string | null) | undefined;
    const aria = typeof get === 'function' ? (get.call(el, 'aria-label') ?? '') : '';
    if (aria.trim().length > 0) return aria.trim();
    const text = (el['innerText'] ?? el['textContent'] ?? '') as string;
    return String(text).replace(/\s+/g, ' ').trim();
  };

  const roleOf = (el: Record<string, unknown>): string => {
    const get = el['getAttribute'] as ((n: string) => string | null) | undefined;
    const explicit = typeof get === 'function' ? (get.call(el, 'role') ?? '') : '';
    return explicit.toLowerCase();
  };

  const visit = (node: PathNode): void => {
    if (seen >= CAP || matches.length > 1) return;
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === undefined) continue;
      seen += 1;
      const el = child as unknown as Record<string, unknown>;
      const rawTag = el['tagName'];
      const tag = typeof rawTag === 'string' ? rawTag.toLowerCase() : '';
      if (tag === wanted.tag) {
        // Role may be implicit on the page (no role= attribute); an empty recorded role matches anything,
        // which is what keeps a plain <button> findable without re-deriving the whole role algorithm here.
        const role = roleOf(el);
        const roleOk = wanted.role.length === 0 || role.length === 0 || role === wanted.role;
        if (roleOk && nameOf(el) === wanted.name) matches.push(child);
      }
      if (child.shadowRoot !== null && child.shadowRoot !== undefined) visit(child.shadowRoot);
      else if (child.tagName === 'IFRAME' && child.contentDocument !== null && child.contentDocument !== undefined) {
        visit(child.contentDocument);
      }
      visit(child);
    }
  };

  visit(root);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
