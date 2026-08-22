import { describe, expect, it } from 'vitest';
import { contrastRatio, mixTowardBlack, parseHex, relativeLuminance } from './contrast';

describe('the contrast maths matches the WCAG reference values', () => {
  it('scores black on white as 21:1 and a colour against itself as 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#4a4a4a', '#4a4a4a')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#112233', '#ddeeff')).toBeCloseTo(contrastRatio('#ddeeff', '#112233'), 9);
  });

  it('reproduces a known published pair', () => {
    // #767676 on white is the canonical "exactly AA for normal text" grey.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.6);
  });

  it('puts white at luminance 1 and black at 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 9);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 9);
  });

  it('expands three-digit hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
  });

  it('throws on a value that is not a colour, instead of scoring it as black', () => {
    expect(() => parseHex('var(--surface-base)')).toThrow();
  });

  it('evaluates the one color-mix form the tokens use', () => {
    expect(mixTowardBlack('#ffffff', 95)).toBe('#f2f2f2');
    expect(mixTowardBlack('#ffffff', 100)).toBe('#ffffff');
  });
});
