import { describe, it, expect } from 'vitest';
import { evaluateOmniboxCalc } from './omnibox-calc';

function val(input: string): number | null {
  return evaluateOmniboxCalc(input)?.value ?? null;
}

describe('evaluateOmniboxCalc', () => {
  it('evaluates the canonical 2+2', () => {
    expect(val('2+2')).toBe(4);
    expect(evaluateOmniboxCalc('2+2')?.formatted).toBe('4');
  });

  it('respects operator precedence and parentheses', () => {
    expect(val('2 + 3 * 4')).toBe(14);
    expect(val('(2 + 3) * 4')).toBe(20);
    expect(val('10 - 2 - 3')).toBe(5); // left-associative
    expect(val('2 * (3 + (4 - 1))')).toBe(12);
  });

  it('handles decimals, unary minus, and modulo', () => {
    expect(val('3.5 * 2')).toBe(7);
    expect(val('-5 + 8')).toBe(3);
    expect(val('10 % 3')).toBe(1);
    expect(val('.5 + .25')).toBe(0.75);
  });

  it('trims floating-point noise', () => {
    expect(val('0.1 + 0.2')).toBe(0.3);
    expect(evaluateOmniboxCalc('0.1 + 0.2')?.formatted).toBe('0.3');
  });

  it('surfaces fixed-ratio unit conversions through the same inline result path', () => {
    expect(evaluateOmniboxCalc('1 in to cm')?.formatted).toBe('2.54 cm');
    expect(evaluateOmniboxCalc('32 f c')?.formatted).toBe('0 C');
  });

  it('returns null for a bare number (not a calculation)', () => {
    expect(evaluateOmniboxCalc('42')).toBeNull();
  });

  it('returns null for search terms and URLs', () => {
    expect(evaluateOmniboxCalc('best laptop 2026')).toBeNull();
    expect(evaluateOmniboxCalc('example.com')).toBeNull();
    expect(evaluateOmniboxCalc('how to 2+2')).toBeNull();
  });

  it('returns null for malformed expressions instead of throwing', () => {
    expect(evaluateOmniboxCalc('2 +')).toBeNull();
    expect(evaluateOmniboxCalc('(2 + 3')).toBeNull();
    expect(evaluateOmniboxCalc('2 ** 3')).toBeNull(); // ** not supported
    expect(evaluateOmniboxCalc('')).toBeNull();
  });

  it('returns null (not Infinity/NaN) for division or modulo by zero', () => {
    expect(evaluateOmniboxCalc('5 / 0')).toBeNull();
    expect(evaluateOmniboxCalc('5 % 0')).toBeNull();
  });

  it('never executes injected code (no eval): identifiers are rejected', () => {
    expect(evaluateOmniboxCalc('alert(1)')).toBeNull();
    expect(evaluateOmniboxCalc('process.exit')).toBeNull();
  });
});
