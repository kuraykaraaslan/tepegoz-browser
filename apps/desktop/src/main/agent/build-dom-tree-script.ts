import { MAX_INTERACTABLE_ELEMENTS } from '@tepegoz/tool-executor';

/**
 * The in-page `buildDomTree` perception script (AI-2), ported from the browser-use / nanobrowser
 * technique into tepegoz's stack. It is injected into an **isolated world** on the page's main frame
 * (so the untrusted page cannot observe or tamper with the traversal) and evaluated with
 * `returnByValue: true`, returning a flat, JSON-serializable list of the **indexable** elements:
 * interactive (computed `cursor` + tag/role/aria/handlers) ∧ visible (box geometry) ∧ on-top
 * (`elementFromPoint` hit-test, so a modal suppresses what it covers) ∧ in the viewport, in document
 * order. The driver validates the payload (zod) and hands it to `parseDomTree`.
 *
 * Traversal pierces OPEN shadow roots and SAME-ORIGIN iframes into one index space (PR2b); closed
 * shadow roots and cross-origin frames are unreachable (they read as null) and are left for a future
 * per-frame CDP-injection pass. Each element is addressed by a child-index `path` (segments crossing
 * shadow/iframe boundaries), re-resolved by the driver via `resolveNodePath`. No page mutation —
 * perception is read-only.
 */

/** Hard cap on candidates the script emits; the pure layer re-caps to {@link MAX_INTERACTABLE_ELEMENTS}. */
const SCAN_EMIT_CAP = MAX_INTERACTABLE_ELEMENTS + 100;
/** Backstop on nodes walked, so a pathological DOM cannot hang perception. */
const SCAN_NODE_CAP = 12_000;
/** Max characters kept from an element's visible text before the pure layer re-caps/sanitizes. */
const MAX_TEXT = 200;

/**
 * Build the injectable expression. Caps + the viewport-expansion band are interpolated as literals so
 * the script stays a pure self-contained IIFE (no closure over host state). `viewportExpansionPx`
 * grows the in-viewport test by that many CSS px on every edge (0 = strictly on-screen, the default);
 * a larger band is the "expand viewport" knob for the rare full-page case. Returns `{ url, title, nodes }`.
 */
export function buildDomTreeExpression(viewportExpansionPx = 0): string {
  const expansion = Math.max(0, Math.trunc(viewportExpansionPx));
  return `(() => {
  const EMIT_CAP = ${String(SCAN_EMIT_CAP)};
  const NODE_CAP = ${String(SCAN_NODE_CAP)};
  const MAX_TEXT = ${String(MAX_TEXT)};
  const EXP = ${String(expansion)};
  // A cursor:pointer region larger than this fraction of the viewport is treated as a wrapper/overlay,
  // not a button — the real target is a descendant. Trims cursor-heuristic over-selection.
  const MAX_POINTER_AREA_FRAC = 0.5;

  const ATTR_ALLOWLIST = ['type','name','placeholder','title','alt','aria-label','aria-expanded','aria-haspopup','aria-selected','aria-checked','data-testid'];
  const INTERACTIVE_TAGS = new Set(['A','BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY','OPTION','LABEL']);
  const INTERACTIVE_ROLES = new Set(['button','link','checkbox','radio','switch','tab','menuitem','menuitemcheckbox','menuitemradio','option','combobox','textbox','searchbox','slider','spinbutton','treeitem']);

  const rectCache = new WeakMap();
  const styleCache = new WeakMap();
  const rectOf = (el) => { let r = rectCache.get(el); if (r === undefined) { r = el.getBoundingClientRect(); rectCache.set(el, r); } return r; };
  // Window-aware: an element inside a same-origin iframe has its own viewport + getComputedStyle host.
  const winOf = (el) => (el.ownerDocument && el.ownerDocument.defaultView) || window;
  const styleOf = (el) => { let s = styleCache.get(el); if (s === undefined) { s = winOf(el).getComputedStyle(el); styleCache.set(el, s); } return s; };
  const vpOf = (el) => { const w = winOf(el); return { vw: w.innerWidth || 0, vh: w.innerHeight || 0 }; };

  const isVisible = (el) => {
    const r = rectOf(el);
    if (r.width <= 0 || r.height <= 0) return false;
    const s = styleOf(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const isInViewport = (el) => {
    const r = rectOf(el);
    const vp = vpOf(el);
    return r.bottom > -EXP && r.right > -EXP && r.top < vp.vh + EXP && r.left < vp.vw + EXP;
  };

  const isTopElement = (el) => {
    const r = rectOf(el);
    const vp = vpOf(el);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Off the element's own (real) viewport — cannot hit-test, so accept it. Occlusion is tested per
    // root: an element's getRootNode() (its shadowRoot or document) hit-tests in its own coord space.
    if (cx < 0 || cy < 0 || cx > vp.vw || cy > vp.vh) return true;
    const root = el.getRootNode();
    const hit = (root && root.elementFromPoint) ? root.elementFromPoint(cx, cy) : el.ownerDocument.elementFromPoint(cx, cy);
    if (hit === null) return false;
    return hit === el || el.contains(hit) || hit.contains(el);
  };

  const hasHandler = (el) => el.onclick !== null || el.getAttribute('onclick') !== null || el.getAttribute('onmousedown') !== null;

  const isInteractive = (el) => {
    const doc = el.ownerDocument;
    if (el === doc.body || el === doc.documentElement) return false;
    if (el.hasAttribute('disabled')) return true; // still index it — surfaced as disabled downstream
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    const role = el.getAttribute('role');
    if (role !== null && INTERACTIVE_ROLES.has(role.toLowerCase())) return true;
    if (el.isContentEditable) return true;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && ti !== '-1') return true;
    if (hasHandler(el)) return true;
    // The div/span-button heuristic: a pointer cursor the site set for a clickable region — but skip
    // wrapper/overlay-sized regions, whose real target is a descendant (trims over-selection).
    if (styleOf(el).cursor === 'pointer') {
      const r = rectOf(el);
      const vp = vpOf(el);
      return (r.width * r.height) / (vp.vw * vp.vh || 1) <= MAX_POINTER_AREA_FRAC;
    }
    return false;
  };

  const implicitRole = (el) => {
    switch (el.tagName) {
      case 'A': return el.hasAttribute('href') ? 'link' : '';
      case 'BUTTON': case 'SUMMARY': return 'button';
      case 'SELECT': return 'combobox';
      case 'TEXTAREA': return 'textbox';
      case 'INPUT': {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button';
        if (t === 'range') return 'slider';
        return 'textbox';
      }
      default: return el.isContentEditable ? 'textbox' : '';
    }
  };

  const textOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim().slice(0, MAX_TEXT);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const ph = el.getAttribute('placeholder');
      if (ph && ph.trim()) return ph.trim().slice(0, MAX_TEXT);
    }
    if (el.tagName === 'IMG' || el.tagName === 'INPUT') {
      const alt = el.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim().slice(0, MAX_TEXT);
    }
    const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (t) return t.slice(0, MAX_TEXT);
    const title = el.getAttribute('title');
    return title ? title.trim().slice(0, MAX_TEXT) : '';
  };

  const attrsOf = (el) => {
    const out = {};
    for (const name of ATTR_ALLOWLIST) {
      const v = el.getAttribute(name);
      if (v !== null && v !== '') out[name] = v;
    }
    return out;
  };

  // Emit one indexable element. \`path\` is a child-index address (segments crossing shadow/iframe
  // boundaries) the driver re-resolves via resolveNodePath — see @tepegoz/tool-executor/dom-path.
  const nodes = [];
  const emit = (el, path) => {
    const node = { tag: el.tagName.toLowerCase(), path: path, role: el.getAttribute('role') || implicitRole(el), name: textOf(el) };
    if (el.tagName === 'A') { const href = el.getAttribute('href'); if (href) node.href = el.href || href; }
    if ('value' in el && el.value != null && String(el.value) !== '') node.value = String(el.value).slice(0, MAX_TEXT);
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') node.disabled = true;
    const attributes = attrsOf(el);
    if (Object.keys(attributes).length > 0) node.attributes = attributes;
    if (el.tagName === 'INPUT') {
      node.inputType = (el.getAttribute('type') || 'text').toLowerCase();
      const accept = el.getAttribute('accept'); if (accept) node.accept = accept;
      if (el.hasAttribute('multiple')) node.multiple = true;
    }
    nodes.push(node);
  };

  let scanned = 0;
  const capped = () => nodes.length >= EMIT_CAP || scanned >= NODE_CAP;

  // Recursive walk piercing OPEN shadow roots + SAME-ORIGIN iframes into one index space. \`chain\` is
  // the boundary-crossing segments to reach the current root; \`pathInRoot\` the child-index steps
  // within it. Closed shadow roots / cross-origin frames read as null and are simply not descended.
  const visit = (el, pathInRoot, chain) => {
    if (capped()) return;
    scanned++;
    const fullPath = chain.concat([pathInRoot]);
    if (isVisible(el) && isInViewport(el) && isInteractive(el) && isTopElement(el)) emit(el, fullPath);
    if (el.shadowRoot) {
      visitRoot(el.shadowRoot, fullPath);
    } else if (el.tagName === 'IFRAME') {
      let doc = null;
      try { doc = el.contentDocument; } catch (e) { doc = null; }
      if (doc) visitRoot(doc, fullPath);
    }
    const kids = el.children;
    for (let j = 0; j < kids.length && !capped(); j++) visit(kids[j], pathInRoot.concat(j), chain);
  };
  const visitRoot = (root, chain) => {
    const kids = root.children;
    for (let j = 0; j < kids.length && !capped(); j++) visit(kids[j], [j], chain);
  };

  visitRoot(document, []);
  return { url: document.location.href, title: document.title, nodes };
})()`;
}
