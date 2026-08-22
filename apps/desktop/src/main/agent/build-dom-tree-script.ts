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
 * Interactivity has two tiers, because `cursor` is an INHERITED CSS property and the naive heuristic
 * indexed a control's every glyph as a separate target. STRONG = the element declares itself a control
 * (tag/role/tabindex/handler/contenteditable). WEAK = only the pointer cursor says so, and it is kept
 * ONLY when no strong control sits above it (its cursor would be inherited) or below it (the wrapper is
 * not the target). A LinkedIn result row costs a handful of elements this way instead of the ~46 it cost
 * on the snapshot that motivated this (200 indexed elements bought four-and-a-half of the ten rows).
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

  const ATTR_ALLOWLIST = ['type','name','placeholder','title','alt','aria-label','aria-expanded','aria-haspopup','aria-selected','aria-checked','data-testid','pattern','minlength','maxlength','min','max','autocomplete','inputmode','aria-required','aria-invalid'];
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

  // STRONG evidence: the element declares itself a control. Independent of \`cursor\`, so it is also what
  // tells a descendant that its own pointer cursor is merely INHERITED from a real control above it.
  const isStrong = (el) => {
    const doc = el.ownerDocument;
    if (el === doc.body || el === doc.documentElement) return false;
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    const role = el.getAttribute('role');
    if (role !== null && INTERACTIVE_ROLES.has(role.toLowerCase())) return true;
    if (el.isContentEditable) return true;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && ti !== '-1') return true;
    return hasHandler(el);
  };

  /*
   * 'strong' | 'weak' | null. \`cursor\` is an INHERITED CSS property, so every span, svg and path inside a
   * \`cursor:pointer\` button reports \`pointer\` too — on a LinkedIn people-search result that turned one
   * Connect button into eight indexed elements and burned the whole 200-element budget on four result
   * rows. So the div/span-button heuristic is now the WEAK tier, kept only when the element is the sole
   * representative of its clickable region:
   *   - \`strongAncestor\` — a real control already sits above it, so the cursor is inherited and the
   *     control, not its glyphs, is the click target;
   *   - \`weakAncestor\` — an outer pointer region was already indexed, so this is the same region's inner
   *     markup (the \`div > p > span\` that all read "İzmir, Türkiye"), not a second target.
   * The mirror case (a wrapper ABOVE a real control) is handled during the walk: emitting a strong node
   * retracts the weak ancestors it was nested in.
   */
  const interactivityOf = (el, strongAncestor, weakAncestor) => {
    const doc = el.ownerDocument;
    if (el === doc.body || el === doc.documentElement) return null;
    if (el.hasAttribute('disabled')) return 'strong'; // still index it — surfaced as disabled downstream
    if (isStrong(el)) return 'strong';
    if (styleOf(el).cursor === 'pointer') {
      if (strongAncestor || weakAncestor) return null;
      // Skip wrapper/overlay-sized regions, whose real target is a descendant (trims over-selection).
      const r = rectOf(el);
      const vp = vpOf(el);
      return (r.width * r.height) / (vp.vw * vp.vh || 1) <= MAX_POINTER_AREA_FRAC ? 'weak' : null;
    }
    return null;
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

  const collapse = (s) => (s || '').replace(/\\s+/g, ' ').trim();

  // S2 PR3: the two places an accessible name commonly lives that the render-DOM scan used to miss.
  // Both are resolved WITHIN the element's own root (document or shadow root), because an id reference
  // does not cross a shadow boundary — looking it up in the top document would silently grab a
  // same-named element from somewhere else on the page.
  const labelledByText = (el) => {
    const ids = collapse(el.getAttribute('aria-labelledby'));
    if (!ids) return '';
    const root = el.getRootNode();
    const parts = [];
    // Order matters: aria-labelledby="a b" names the element "A B", not "B A".
    for (const id of ids.split(' ')) {
      const target = root.getElementById ? root.getElementById(id) : el.ownerDocument.getElementById(id);
      if (target) { const t = collapse(target.innerText || target.textContent); if (t) parts.push(t); }
    }
    return parts.join(' ');
  };

  // \`el.labels\` covers BOTH a wrapping <label> and a detached <label for="…">, and only exists on the
  // form controls that can have one — which is exactly the set that needs it.
  const nativeLabelText = (el) => {
    let labels = null;
    try { labels = el.labels; } catch (e) { labels = null; }
    if (!labels || labels.length === 0) return '';
    const parts = [];
    for (let i = 0; i < labels.length; i++) { const t = collapse(labels[i].innerText || labels[i].textContent); if (t) parts.push(t); }
    return parts.join(' ');
  };

  const textOf = (el) => {
    // Accessible-name order (matches the a11y fallback this default path was regressing against):
    // aria-labelledby → aria-label → native <label> → placeholder → alt → own text → title.
    const referenced = labelledByText(el);
    if (referenced) return referenced.slice(0, MAX_TEXT);
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim().slice(0, MAX_TEXT);
    const native = nativeLabelText(el);
    if (native) return native.slice(0, MAX_TEXT);
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
  // Parallel keep-flags: a weak wrapper is emitted optimistically and retracted when a real control turns
  // up inside it. Kept out of the node objects so nothing internal can leak into the CDP payload.
  const keep = [];
  let dropped = 0;
  const VALUE_TAGS = new Set(['INPUT','SELECT','TEXTAREA','OPTION','OUTPUT']);
  const emit = (el, path) => {
    const node = { tag: el.tagName.toLowerCase(), path: path, role: el.getAttribute('role') || implicitRole(el), name: textOf(el) };
    if (el.tagName === 'A') { const href = el.getAttribute('href'); if (href) node.href = el.href || href; }
    // Form controls only: HTMLLIElement/HTMLProgressElement also have a \`value\`, and an ordinary <li>
    // was being reported to the model as \`= "0"\`.
    if (VALUE_TAGS.has(el.tagName) && el.value != null && String(el.value) !== '') node.value = String(el.value).slice(0, MAX_TEXT);
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') node.disabled = true;
    const attributes = attrsOf(el);
    // AI-4 s16: a native \`required\` is a boolean property (getAttribute returns '' → dropped above), so
    // surface it explicitly. \`pattern\`/\`maxlength\`/\`aria-*\` etc. carry string values via the allow-list.
    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.required === true) {
      attributes.required = 'true';
    }
    if (Object.keys(attributes).length > 0) node.attributes = attributes;
    if (el.tagName === 'INPUT') {
      node.inputType = (el.getAttribute('type') || 'text').toLowerCase();
      const accept = el.getAttribute('accept'); if (accept) node.accept = accept;
      if (el.hasAttribute('multiple')) node.multiple = true;
    }
    nodes.push(node);
    keep.push(true);
    return nodes.length - 1;
  };
  // Retract the weak wrappers this element was nested in: a real control inside them IS the target.
  const retract = (weakChain) => {
    for (let i = 0; i < weakChain.length; i++) {
      const idx = weakChain[i];
      if (keep[idx]) { keep[idx] = false; dropped++; }
    }
  };

  let scanned = 0;
  // Retracted nodes do not count against the budget, so suppressing noise actually buys page coverage.
  const capped = () => (nodes.length - dropped) >= EMIT_CAP || scanned >= NODE_CAP;

  // Recursive walk piercing OPEN shadow roots + SAME-ORIGIN iframes into one index space. \`chain\` is
  // the boundary-crossing segments to reach the current root; \`pathInRoot\` the child-index steps
  // within it. Closed shadow roots / cross-origin frames read as null and are simply not descended.
  const visit = (el, pathInRoot, chain, strongAncestor, weakChain) => {
    if (capped()) return;
    scanned++;
    const fullPath = chain.concat([pathInRoot]);
    let childWeak = weakChain;
    const kind = (isVisible(el) && isInViewport(el)) ? interactivityOf(el, strongAncestor, weakChain.length > 0) : null;
    if (kind !== null && isTopElement(el)) {
      const idx = emit(el, fullPath);
      if (kind === 'strong') retract(weakChain); else childWeak = weakChain.concat([idx]);
    }
    // Propagated whether or not the control itself was emitted: an off-screen or occluded <button> still
    // means its children's pointer cursor is inherited rather than their own.
    const childStrong = strongAncestor || isStrong(el);
    if (el.shadowRoot) {
      visitRoot(el.shadowRoot, fullPath, childStrong, childWeak);
    } else if (el.tagName === 'IFRAME') {
      let doc = null;
      try { doc = el.contentDocument; } catch (e) { doc = null; }
      if (doc) visitRoot(doc, fullPath, childStrong, childWeak);
    }
    const kids = el.children;
    for (let j = 0; j < kids.length && !capped(); j++) visit(kids[j], pathInRoot.concat(j), chain, childStrong, childWeak);
  };
  const visitRoot = (root, chain, strongAncestor, weakChain) => {
    const kids = root.children;
    for (let j = 0; j < kids.length && !capped(); j++) visit(kids[j], [j], chain, strongAncestor, weakChain);
  };

  visitRoot(document, [], false, []);
  const kept = [];
  for (let i = 0; i < nodes.length; i++) { if (keep[i]) kept.push(nodes[i]); }

  // S10: how much of the viewport is painted surface the DOM cannot describe. A canvas/webgl region has
  // no child nodes to scan, so a page whose content lives there reads as empty however carefully we walk
  // it — this fraction is the only honest way for the loop to notice.
  let canvasFraction = 0;
  try {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    if (vw > 0 && vh > 0) {
      let painted = 0;
      const surfaces = document.querySelectorAll('canvas,svg[data-webgl],video');
      for (let i = 0; i < surfaces.length; i++) {
        const r = surfaces[i].getBoundingClientRect();
        // Intersect with the viewport: an off-screen canvas is not covering anything the agent needs.
        const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
        const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        painted += w * h;
      }
      canvasFraction = Math.min(1, painted / (vw * vh));
    }
  } catch (e) {
    canvasFraction = 0;
  }

  return { url: document.location.href, title: document.title, nodes: kept, canvasFraction };
})()`;
}
