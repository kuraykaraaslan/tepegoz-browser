import { describe, expect, it } from 'vitest';
import {
  clampFontScale,
  decreaseFontScale,
  DEFAULT_READER_PREFERENCES,
  fontScaleClass,
  FONT_SCALE_STEPS,
  increaseFontScale,
  isFontScaleAtMax,
  isFontScaleAtMin,
  parseReaderPreferences,
  readingThemeClass,
} from './reader-preferences';

const MAX = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1]!;
const MIN = FONT_SCALE_STEPS[0];

describe('font scale steps', () => {
  it('increase walks up the steps and stops at the ceiling', () => {
    expect(increaseFontScale(1)).toBe(1.15);
    expect(increaseFontScale(MAX)).toBe(MAX);
    expect(isFontScaleAtMax(increaseFontScale(MAX))).toBe(true);
  });

  it('decrease walks down the steps and stops at the floor', () => {
    expect(decreaseFontScale(1)).toBe(0.85);
    expect(decreaseFontScale(MIN)).toBe(MIN);
    expect(isFontScaleAtMin(decreaseFontScale(MIN))).toBe(true);
  });

  it('clamps an arbitrary value to the nearest step', () => {
    expect(clampFontScale(0.1)).toBe(MIN);
    expect(clampFontScale(99)).toBe(MAX);
    expect(clampFontScale(1.1)).toBe(1.15);
  });

  it('maps a scale to a stable container class', () => {
    expect(fontScaleClass(1)).toBe('reader-scale-1');
    expect(fontScaleClass(MAX)).toBe(`reader-scale-${String(FONT_SCALE_STEPS.length - 1)}`);
  });
});

describe('readingThemeClass', () => {
  it('names the container class per theme', () => {
    expect(readingThemeClass('sepia')).toBe('reader-theme-sepia');
    expect(readingThemeClass('dark')).toBe('reader-theme-dark');
  });
});

describe('parseReaderPreferences', () => {
  it('returns the default for a non-object or a missing store', () => {
    expect(parseReaderPreferences(null)).toEqual(DEFAULT_READER_PREFERENCES);
    expect(parseReaderPreferences('nonsense')).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('keeps a valid stored shape, snapping the scale to a step', () => {
    expect(parseReaderPreferences({ fontScale: 1.3, theme: 'dark' })).toEqual({
      fontScale: 1.3,
      theme: 'dark',
    });
    expect(parseReaderPreferences({ fontScale: 1.28, theme: 'sepia' })).toEqual({
      fontScale: 1.3,
      theme: 'sepia',
    });
  });

  it('falls back field by field on a corrupt shape', () => {
    expect(parseReaderPreferences({ fontScale: 'big', theme: 'neon' })).toEqual(
      DEFAULT_READER_PREFERENCES,
    );
  });
});
