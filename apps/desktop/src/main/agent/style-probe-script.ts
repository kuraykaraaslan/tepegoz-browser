import { resolveNodePath, type NodePath } from '@tepegoz/tool-executor';

/**
 * The in-page style/box-model probe (P3-d, the style half of the read-only dev-diagnostics trio) behind
 * `browser_get_styles`. Injected into an ISOLATED WORLD via `webContents.executeJavaScriptInIsolatedWorld`
 * — Electron's own API, never `webContents.debugger`/CDP. Unlike its `browser_get_console` /
 * `browser_get_network` siblings, this file needs no debugger attachment, no enabled CDP domain, and no
 * permanent listener at all: it is a single one-shot read of ONE already-identified element.
 *
 * The element is addressed by the SAME child-index `path` the render-DOM perception script (AI-2,
 * `build-dom-tree-script.ts`) already recorded for the ref at snapshot time — re-resolved here with the
 * exact `resolveNodePath` algorithm the driver's action dispatch re-resolves a stale ref with
 * (`cdp-driver-dom.electron.ts`'s `pathToObjectId`), just run through Electron's isolated-world API
 * instead of a CDP `Runtime.evaluate` call. `resolveNodePath` is self-contained (no module scope) and is
 * unit-tested directly in `@tepegoz/tool-executor`'s `dom-path.test.ts`; injecting it via `.toString()`
 * means what runs in the page is exactly what is tested there.
 *
 * "Visible" mirrors the SAME two-part notion `build-dom-tree-script.ts`'s `isVisible`/`isInViewport` use
 * to decide whether an element is indexable at all — CSS-rendered (non-zero box, not
 * `hidden`/`none`/`opacity:0`) AND within the viewport — rather than inventing a second definition.
 */

export function buildStyleProbeExpression(path: NodePath): string {
  return `(() => {
    const resolveNodePath = ${resolveNodePath.toString()};
    const path = ${JSON.stringify(path)};
    const el = resolveNodePath(document, path);
    if (!el || typeof el.getBoundingClientRect !== 'function') return { found: false };
    const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    const r = el.getBoundingClientRect();
    const s = win.getComputedStyle(el);
    const vw = win.innerWidth || 0;
    const vh = win.innerHeight || 0;
    // Mirrors build-dom-tree-script.ts's isVisible/isInViewport — the same "indexable" notion, not a
    // second one invented for this tool.
    const cssVisible = r.width > 0 && r.height > 0
      && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    const inViewport = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    return {
      found: true,
      display: String(s.display || ''),
      visibility: String(s.visibility || ''),
      opacity: String(s.opacity || ''),
      position: String(s.position || ''),
      zIndex: String(s.zIndex || ''),
      color: String(s.color || ''),
      backgroundColor: String(s.backgroundColor || ''),
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
      visible: cssVisible && inViewport,
    };
  })()`;
}
