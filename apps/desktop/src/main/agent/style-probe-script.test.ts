import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import type { NodePath } from '@tepegoz/tool-executor';
import { buildStyleProbeExpression } from './style-probe-script.js';

/**
 * Runs the REAL injected script inside a `vm` over a minimal fake DOM — the same technique
 * `build-dom-tree-noise.test.ts`/`build-dom-tree-names.test.ts` use for `build-dom-tree-script.ts`. What
 * is faked is geometry/`getComputedStyle`; what is real is the traversal (`resolveNodePath`, already
 * unit-tested on its own in `@tepegoz/tool-executor`'s `dom-path.test.ts`) and the visibility/box-model
 * decision under test.
 */

interface FakeRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface FakeStyle {
  display?: string;
  visibility?: string;
  opacity?: string;
  position?: string;
  zIndex?: string;
  color?: string;
  backgroundColor?: string;
}

function runProbe(
  path: NodePath,
  opts: {
    rect?: Partial<FakeRect>;
    style?: FakeStyle;
    viewport?: { w: number; h: number };
    noElement?: boolean;
  } = {},
): unknown {
  const rect: FakeRect = { top: 10, left: 20, right: 120, bottom: 40, width: 100, height: 30, ...opts.rect };
  const style: Required<FakeStyle> = {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    position: 'static',
    zIndex: 'auto',
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    ...opts.style,
  };
  const viewport = opts.viewport ?? { w: 800, h: 600 };

  const el: Record<string, unknown> = {
    tagName: 'DIV',
    children: [],
    shadowRoot: null,
    getBoundingClientRect: () => rect,
  };
  const doc: Record<string, unknown> = {
    children: opts.noElement === true ? [] : [el],
  };
  const win: Record<string, unknown> = {
    innerWidth: viewport.w,
    innerHeight: viewport.h,
    getComputedStyle: (target: unknown) => (target === el ? style : {}),
  };
  el['ownerDocument'] = doc;
  doc['defaultView'] = win;

  const context = vm.createContext({ document: doc, window: win });
  return vm.runInContext(buildStyleProbeExpression(path), context);
}

describe('buildStyleProbeExpression', () => {
  it('produces a syntactically valid, self-contained JS expression', () => {
    expect(() => new vm.Script(`(${buildStyleProbeExpression([[0]])})`)).not.toThrow();
  });

  it('is an IIFE (evaluatable expression, not a statement)', () => {
    const expr = buildStyleProbeExpression([[0]]);
    expect(expr.trimStart().startsWith('(')).toBe(true);
    expect(expr.trimEnd().endsWith(')')).toBe(true);
  });

  it('resolves an ordinary visible on-screen element and reports its style + box', () => {
    const result = runProbe([[0]]);
    expect(result).toMatchObject({
      found: true,
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      zIndex: 'auto',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      x: 20,
      y: 10,
      width: 100,
      height: 30,
      visible: true,
    });
  });

  it('found:false when the path does not resolve (stale/unknown ref)', () => {
    expect(runProbe([[0]], { noElement: true })).toEqual({ found: false });
  });

  it('a display:none element is CSS-invisible → visible:false, values still reported', () => {
    const result = runProbe([[0]], { style: { display: 'none' } }) as { display: string; visible: boolean };
    expect(result.display).toBe('none');
    expect(result.visible).toBe(false);
  });

  it('a visibility:hidden element is CSS-invisible → visible:false', () => {
    const result = runProbe([[0]], { style: { visibility: 'hidden' } }) as { visible: boolean };
    expect(result.visible).toBe(false);
  });

  it('a zero-opacity element is CSS-invisible → visible:false', () => {
    const result = runProbe([[0]], { style: { opacity: '0' } }) as { opacity: string; visible: boolean };
    expect(result.opacity).toBe('0');
    expect(result.visible).toBe(false);
  });

  it('a zero-area box is treated as not visible regardless of style', () => {
    const result = runProbe([[0]], { rect: { width: 0, height: 0, right: 20, bottom: 10 } }) as {
      visible: boolean;
    };
    expect(result.visible).toBe(false);
  });

  it('an off-screen (scrolled-away) element can be CSS-visible yet outside the viewport → visible:false', () => {
    const result = runProbe([[0]], {
      rect: { top: 5000, left: 5000, right: 5100, bottom: 5030, width: 100, height: 30 },
    }) as { display: string; visible: boolean };
    // display/visibility/opacity all say "shown" — only the position places it off-screen.
    expect(result.display).toBe('block');
    expect(result.visible).toBe(false);
  });
});
