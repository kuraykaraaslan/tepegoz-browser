import { describe, expect, it } from 'vitest';
import type { Rectangle } from 'electron';
import { resolveViewBounds } from './tabs-content-bounds';

const zero: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
const real: Rectangle = { x: 0, y: 80, width: 1280, height: 766 };

describe('resolveViewBounds', () => {
  it('returns the renderer-measured bounds once they have a positive area (authority)', () => {
    expect(resolveViewBounds(real, [1280, 854])).toBe(real);
  });

  it('falls back to the native content size when current bounds are 0×0 (the blindness fix)', () => {
    // This is the regression guard: a tab sized before the renderer reports must NOT stay 0×0, or the
    // page gets innerWidth/innerHeight 0 and perception rejects every element.
    expect(resolveViewBounds(zero, [1280, 854])).toEqual({ x: 0, y: 0, width: 1280, height: 854 });
  });

  it('falls back when either dimension is non-positive', () => {
    expect(resolveViewBounds({ x: 0, y: 0, width: 1280, height: 0 }, [800, 600])).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(resolveViewBounds({ x: 0, y: 0, width: 0, height: 766 }, [800, 600])).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('floors to 1×1 when the window is gone (contentSize null) — never zero-area', () => {
    expect(resolveViewBounds(zero, null)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('floors a zero/odd native content size to at least 1×1', () => {
    expect(resolveViewBounds(zero, [0, 0])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(resolveViewBounds(zero, [])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('normalizes the fallback origin to the content-area top-left (x/y = 0)', () => {
    // getContentSize gives only [w,h]; the view is positioned relative to the window content area.
    const out = resolveViewBounds(zero, [1024, 768]);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});
