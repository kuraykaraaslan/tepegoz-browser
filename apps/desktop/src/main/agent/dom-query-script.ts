import { resolveNodePath, type NodePath } from '@tepegoz/tool-executor';

/**
 * The in-page bounded DOM query probe (S2/PR7 P3-a) behind `browser_search_nodes`. Injected into an
 * ISOLATED WORLD via `webContents.executeJavaScriptInIsolatedWorld` — Electron's own API, never
 * `webContents.debugger`/CDP. The query string (a CSS selector or an XPath expression) is DATA passed as
 * an argument to this FIXED, contributor-authored script; it is never evaluated as code, so this does
 * not reopen ADR-0026 — the same distinction `browser_search_elements`'s own doc paragraph draws.
 *
 * Runs the query through the browser's NATIVE search (`document.querySelectorAll` for CSS,
 * `document.evaluate` for XPath) against the live light DOM. Neither API descends into an open shadow
 * root or a same-origin iframe's document from `document` — that reach belongs to the render-DOM
 * perception scan (`build-dom-tree-script.ts`), not this tool; a query that would need it simply finds
 * nothing there, which is the browser's own native behaviour, not a bug this script introduces.
 *
 * `ref` addressing: for each match, checks whether it is already one of the tab's currently tracked refs
 * (resolved from `existingPaths`, the SAME child-index `path` space `cdp-driver-snapshot.electron.ts`
 * records) by DOM node identity (`===`). If so, that ref is reused — one element, one ref, never two. If
 * not, `computeNodePath` (the light-DOM-only INVERSE of `resolveNodePath`: walk up from the element to
 * `document`, recording its index among each ancestor's `.children`) computes a fresh path for the host
 * to mint a new ref from. A node `computeNodePath` cannot address (a shadow-root boundary, a detached
 * node) reports `path: null` — the host then reports `ref: null` rather than fabricate one.
 */

/** Backstop on the ancestor walk, so a pathological DOM cannot hang the probe. */
const MAX_PATH_DEPTH = 500;
/** Defensive transport cap — the real sanitize+cap happens host-side in `summarizeQuery`; this only
 *  keeps one hostile attribute (e.g. a huge data: URI) from ballooning the isolated-world round trip. */
const MAX_ATTR_VALUE_TRANSPORT_CHARS = 1000;
const MAX_ATTRS_PER_ELEMENT = 40;
const MAX_ERROR_CHARS = 200;
/** `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE` — the spec-fixed numeric value, used directly so the script
 *  does not depend on the `XPathResult` global resolving (it does in a real page; a literal is simpler
 *  to unit-test against a fake DOM). */
const ORDERED_NODE_SNAPSHOT_TYPE = 7;

/** One existing ref this tab's latest snapshot already tracks, addressed by its child-index path. */
export interface ExistingPathEntry {
  ref: number;
  path: NodePath;
}

export function buildDomQueryExpression(
  query: string,
  queryType: 'css' | 'xpath',
  existingPaths: readonly ExistingPathEntry[],
  cap: number,
): string {
  return `(() => {
    const resolveNodePath = ${resolveNodePath.toString()};
    const query = ${JSON.stringify(query)};
    const queryType = ${JSON.stringify(queryType)};
    const existingPaths = ${JSON.stringify(existingPaths)};
    const CAP = ${JSON.stringify(cap)};
    const MAX_DEPTH = ${JSON.stringify(MAX_PATH_DEPTH)};
    const MAX_ATTRS = ${JSON.stringify(MAX_ATTRS_PER_ELEMENT)};
    const MAX_ATTR_CHARS = ${JSON.stringify(MAX_ATTR_VALUE_TRANSPORT_CHARS)};
    const MAX_ERR = ${JSON.stringify(MAX_ERROR_CHARS)};
    const SNAPSHOT_TYPE = ${JSON.stringify(ORDERED_NODE_SNAPSHOT_TYPE)};

    // Light-DOM-only inverse of resolveNodePath: walk UP from an element to \`document\`, recording its
    // index among each ancestor's .children. Returns null for anything resolveNodePath's own DOWN walk
    // (rooted at document) could never re-find this way — a shadow-root-hosted node (no .parentNode
    // across the boundary) or a detached node. Native querySelectorAll/document.evaluate from \`document\`
    // never returns a shadow-hosted node anyway, so this is a defensive case, not the common one.
    const computeNodePath = (el) => {
      const indices = [];
      let node = el;
      let depth = 0;
      while (node && node !== document) {
        if (depth > MAX_DEPTH) return null;
        depth++;
        const parent = node.parentNode;
        if (!parent || !parent.children) return null;
        const idx = Array.prototype.indexOf.call(parent.children, node);
        if (idx === -1) return null;
        indices.unshift(idx);
        node = parent;
      }
      if (node !== document) return null;
      return [indices];
    };

    let nodes;
    try {
      if (queryType === 'css') {
        nodes = Array.prototype.slice.call(document.querySelectorAll(query));
      } else {
        const result = document.evaluate(query, document, null, SNAPSHOT_TYPE, null);
        nodes = [];
        for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
      }
    } catch (e) {
      // A malformed CSS selector or invalid XPath throws in the engine that parses it — caught here and
      // turned into a clean, bounded result. Never an unhandled exception reaching the caller.
      const message = (e && e.message) ? e.message : String(e || 'invalid query');
      return { ok: false, error: String(message).slice(0, MAX_ERR) };
    }

    // XPath can match attribute/text nodes too (e.g. "//div/@id"); only Element nodes have a tag and an
    // attribute list, so anything else is filtered rather than reported with fabricated fields.
    const elements = nodes.filter((n) => n && n.nodeType === 1);
    const total = elements.length;
    const capped = elements.slice(0, CAP);

    const existingResolved = existingPaths.map((e) => ({ ref: e.ref, node: resolveNodePath(document, e.path) }));

    const matches = capped.map((el) => {
      const tag = String(el.tagName || '').toLowerCase();
      const attributes = {};
      const attrs = el.attributes || [];
      const attrCount = Math.min(attrs.length, MAX_ATTRS);
      for (let i = 0; i < attrCount; i++) {
        const a = attrs[i];
        if (a && a.name) {
          attributes[a.name] = String(a.value == null ? '' : a.value).slice(0, MAX_ATTR_CHARS);
        }
      }
      let existingRef = null;
      for (let i = 0; i < existingResolved.length; i++) {
        if (existingResolved[i].node === el) {
          existingRef = existingResolved[i].ref;
          break;
        }
      }
      const path = existingRef === null ? computeNodePath(el) : null;
      return { tag: tag, attributes: attributes, existingRef: existingRef, path: path };
    });

    return { ok: true, total: total, matches: matches };
  })()`;
}
