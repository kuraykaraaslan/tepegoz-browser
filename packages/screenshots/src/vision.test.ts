import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import {
  DEFAULT_IMAGE_TOKEN_BUDGET,
  DEFAULT_PX_PER_TOKEN,
  MIN_EDGE,
  fitToBudget,
} from './vision-budget';
import {
  AnnotatedScreenshotSchema,
  MAX_MARKS,
  buildMarks,
  describeMarks,
  refForMark,
} from './vision-marks';
import { buildOverlayExpression } from './vision-overlay-script';

describe('fitToBudget', () => {
  it('leaves a small image alone', () => {
    const fit = fitToBudget({ width: 600, height: 400, maxEdge: 1400 });
    expect(fit.scale).toBe(1);
    expect(fit.width).toBe(600);
  });

  it('respects the edge cap', () => {
    const fit = fitToBudget({ width: 2800, height: 700, maxEdge: 1400, tokenBudget: 1_000_000 });
    expect(fit.width).toBeLessThanOrEqual(1400);
    expect(fit.height).toBe(350);
  });

  it('scales down to meet the token budget, and reports the cost it landed on', () => {
    const fit = fitToBudget({ width: 1400, height: 1400, maxEdge: 1400, tokenBudget: 200 });
    expect(fit.estimatedTokens).toBeLessThanOrEqual(200);
    expect(fit.scale).toBeLessThan(1);
  });

  it('preserves aspect ratio', () => {
    const fit = fitToBudget({ width: 1600, height: 800, maxEdge: 1400, tokenBudget: 300 });
    expect(fit.width / fit.height).toBeCloseTo(2, 1);
  });

  it('refuses to shrink below a readable floor, and reports the honest overspend', () => {
    // An image too small to read costs tokens and answers nothing — worse than an honest overspend.
    const fit = fitToBudget({ width: 1000, height: 1000, maxEdge: 1400, tokenBudget: 1 });
    expect(Math.min(fit.width, fit.height)).toBeGreaterThanOrEqual(MIN_EDGE);
    expect(fit.estimatedTokens).toBeGreaterThan(1);
  });

  it('uses sane defaults', () => {
    const fit = fitToBudget({ width: 4000, height: 3000, maxEdge: 1400 });
    expect(fit.estimatedTokens).toBeLessThanOrEqual(DEFAULT_IMAGE_TOKEN_BUDGET);
    expect(DEFAULT_PX_PER_TOKEN).toBeGreaterThan(0);
  });
});

describe('set-of-marks', () => {
  const source = (ref: number, over: Partial<{ x: number; y: number; width: number; height: number }> = {}) => ({
    ref,
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    ...over,
  });

  it('numbers marks in order and converts boxes to IMAGE pixels', () => {
    const marks = buildMarks([source(7), source(9)], 0.5);
    expect(marks.map((m) => m.mark)).toEqual([1, 2]);
    expect(marks[0]).toMatchObject({ ref: 7, x: 5, y: 10, width: 50, height: 20 });
  });

  it('drops elements too small to carry a legible mark', () => {
    // A number painted with nothing behind it is clutter that can only mislead.
    const marks = buildMarks([source(1, { width: 4, height: 4 }), source(2)], 1);
    expect(marks.map((m) => m.ref)).toEqual([2]);
  });

  it('caps the number of marks', () => {
    const many = Array.from({ length: 200 }, (_, i) => source(i + 1));
    expect(buildMarks(many, 1)).toHaveLength(MAX_MARKS);
  });

  it('resolves a named mark back to its ref', () => {
    const marks = buildMarks([source(7), source(9)], 1);
    expect(refForMark(marks, 2)).toBe(9);
  });

  it('returns null for a mark that does not exist, rather than guessing', () => {
    const marks = buildMarks([source(7)], 1);
    expect(refForMark(marks, 42)).toBeNull();
  });

  it('says plainly when nothing could be marked', () => {
    expect(describeMarks([])).toContain('nothing in it can be acted on');
  });

  it('validates the annotated result at the boundary', () => {
    const marks = buildMarks([source(7)], 1);
    const parsed = AnnotatedScreenshotSchema.safeParse({
      mimeType: 'image/png',
      data: 'QUJD',
      width: 800,
      height: 600,
      scale: 0.5,
      marks,
      estimatedTokens: 400,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a mark pointing at a non-positive ref', () => {
    const bad = {
      mimeType: 'image/png',
      data: 'QUJD',
      width: 8,
      height: 6,
      scale: 1,
      marks: [{ mark: 1, ref: 0, x: 0, y: 0, width: 1, height: 1 }],
      estimatedTokens: 1,
    };
    expect(AnnotatedScreenshotSchema.safeParse(bad).success).toBe(false);
  });
});

describe('overlay script', () => {
  it('compiles as a self-contained expression', () => {
    const expr = buildOverlayExpression('data:image/png;base64,QUJD', 800, 600, [
      { mark: 1, ref: 7, x: 10, y: 20, width: 100, height: 40 },
    ]);
    expect(() => new vm.Script(`(${expr})`)).not.toThrow();
  });

  it('degrades to null instead of throwing when the surface is unavailable', async () => {
    // A fallback path must never turn a missing capability into a failed step.
    const expr = buildOverlayExpression('data:image/png;base64,QUJD', 8, 6, []);
    const context = vm.createContext({});
    const result = (await vm.runInContext(expr, context)) as string | null;
    expect(result).toBeNull();
  });
});
