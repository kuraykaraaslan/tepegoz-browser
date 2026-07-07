import { describe, expect, it } from 'vitest';
import { evaluateOmniboxUnitConversion } from './omnibox-units';

function formatted(input: string): string | null {
  return evaluateOmniboxUnitConversion(input)?.formatted ?? null;
}

describe('evaluateOmniboxUnitConversion', () => {
  it('converts length with explicit and compact forms', () => {
    expect(formatted('12 cm to in')).toBe('4.7244094488 in');
    expect(formatted('1in cm')).toBe('2.54 cm');
    expect(formatted('5 km m')).toBe('5000 m');
  });

  it('converts mass, volume, speed and data units', () => {
    expect(formatted('1 kg lb')).toBe('2.2046226218 lb');
    expect(formatted('2 l to ml')).toBe('2000 ml');
    expect(formatted('72 km/h to mph')).toBe('44.7387258411 mph');
    expect(formatted('1 MiB to KB')).toBe('1048.576 KB');
  });

  it('supports decimal comma and Turkish unit aliases', () => {
    expect(formatted('1,5 kilometre metre')).toBe('1500 m');
    expect(formatted('10 santimetre inç')).toBe('3.937007874 in');
  });

  it('converts temperatures with affine formulas', () => {
    expect(formatted('32 f to c')).toBe('0 C');
    expect(formatted('100 c f')).toBe('212 F');
    expect(formatted('273.15 k c')).toBe('0 C');
  });

  it('returns null for unknown, cross-dimension, or non-conversion input', () => {
    expect(evaluateOmniboxUnitConversion('2+2')).toBeNull();
    expect(evaluateOmniboxUnitConversion('10 cm to kg')).toBeNull();
    expect(evaluateOmniboxUnitConversion('10 parsecs to cm')).toBeNull();
    expect(evaluateOmniboxUnitConversion('weather in istanbul')).toBeNull();
  });
});
