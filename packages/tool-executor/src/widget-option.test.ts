import { describe, it, expect } from 'vitest';
import { findWidgetOption, type WidgetOptionNode, type WidgetOptionRoot } from './widget-option.js';

/** Minimal DOM-shaped candidate for testing the matcher without a real DOM (it is duck-typed). */
function option(
  text: string,
  box: { left: number; top: number; width: number; height: number } = {
    left: 0,
    top: 0,
    width: 20,
    height: 20,
  },
  visible = true,
): WidgetOptionNode {
  return {
    textContent: text,
    getBoundingClientRect: () => box,
    offsetParent: visible ? {} : null,
  };
}

function root(candidates: WidgetOptionNode[]): WidgetOptionRoot {
  return { querySelectorAll: () => candidates };
}

describe('findWidgetOption', () => {
  it('matches a combobox option by exact visible text and returns its center point', () => {
    const found = findWidgetOption(
      root([
        option('Germany', { left: 0, top: 0, width: 10, height: 10 }),
        option('France', { left: 100, top: 40, width: 20, height: 10 }),
      ]),
      'France',
    );
    expect(found).toEqual({ x: 110, y: 45, label: 'France' });
  });

  it('matches diacritic-insensitively, mirroring the native <select> fill path', () => {
    const found = findWidgetOption(root([option('Türkiye')]), 'turkiye');
    expect(found?.label).toBe('Türkiye');
  });

  it('matches a calendar day cell by the DAY OF an ISO date the model typed, not the whole string', () => {
    const found = findWidgetOption(
      root([
        option('11'),
        option('12', { left: 40, top: 40, width: 10, height: 10 }),
        option('13'),
      ]),
      '2027-03-12',
    );
    expect(found?.label).toBe('12');
  });

  it('accepts either the local- or UTC-parsed day (timezone-safe date-only ISO strings)', () => {
    // A date-only ISO string parses as UTC midnight; getDate() and getUTCDate() can legitimately
    // disagree by one depending on the runtime's timezone. Both readings must be tried.
    const found = findWidgetOption(root([option('12')]), '2027-03-12');
    expect(found?.label).toBe('12');
  });

  it('falls back to substring match as the last resort', () => {
    const found = findWidgetOption(root([option('Room 204 — East Wing')]), 'east');
    expect(found?.label).toBe('Room 204 — East Wing');
  });

  it('never matches a hidden candidate (no box, or no offsetParent)', () => {
    expect(
      findWidgetOption(root([option('12', { left: 0, top: 0, width: 0, height: 0 })]), '12'),
    ).toBeNull();
    expect(findWidgetOption(root([option('12', undefined, false)]), '12')).toBeNull();
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(findWidgetOption(root([option('Germany'), option('Spain')]), 'France')).toBeNull();
    expect(findWidgetOption(root([]), 'anything')).toBeNull();
  });

  it('prefers an exact match over a looser day/substring match when both are candidates', () => {
    // "12" as an exact option beats a day-of-month coincidence from a differently-shaped candidate.
    const found = findWidgetOption(
      root([option('12', { left: 0, top: 0, width: 10, height: 10 }), option('12 Downing Street')]),
      '12',
    );
    expect(found?.label).toBe('12');
  });
});
