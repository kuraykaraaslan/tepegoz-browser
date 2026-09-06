// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contrastRatio } from '@tepegoz/ui';
import {
  applyMotionPreference,
  applyTheme,
  describeThemeColor,
  isHexColor,
  luminance,
} from './theme';

/**
 * The theme engine's contract. It had no test at all — and the box it belongs to asks for exactly the
 * property that is checkable: "token-level contrast consistency across light/dark surfaces".
 *
 * Writing it found three defects. `luminance()` averaged raw sRGB channels with no gamma
 * linearization, so it read every mid-tone high (#808080 scored 0.50 instead of 0.22) and decided
 * light-vs-dark text from the wrong number. The derived tokens used fixed shade amounts, which cannot
 * hold a contrast promise — the focus ring measured below 3:1 on seven of the eight shipped presets,
 * and secondary text hit 1.92:1 on a light custom colour. And the custom path never overrode
 * `--primary-on-surface`, so the brand cyan stayed as foreground over an arbitrary background.
 *
 * Two branches are deliberately left uncovered: the loop-exhaustion fallbacks in `shadeUntil` and
 * `accentFor`. Both searches walk to a step-20 candidate of pure white or pure black, and the
 * direction is `bestTextOn`'s winner — so the extreme in that direction always clears the bar
 * (max(contrast(white, base), contrast(black, base)) bottoms out at ~4.58:1, above AA_TEXT, and
 * the label on pure white measures ~17.9:1). They are a belt on a search that terminates.
 */

/** The exact preset list offered in Settings (`settings-appearance-language.tsx`). */
const PRESETS = [
  '#1e293b',
  '#334155',
  '#3f3f46',
  '#0d7377',
  '#4c1d95',
  '#7f1d1d',
  '#78350f',
  '#14532d',
];

/** Colours nobody shipped but the free picker accepts — the mid-tones are where thresholds break. */
const ARBITRARY = [
  '#808080',
  '#949494',
  '#c0c0c0',
  '#e0e0e0',
  '#ffffff',
  '#000000',
  '#f59e0b',
  '#22c55e',
  '#06aec4',
];

const root = (): HTMLElement => document.documentElement;
const cssVar = (name: string): string => root().style.getPropertyValue(name).trim();

let prefersDark = false;
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') && prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  root().className = '';
  root().removeAttribute('style');
  root().removeAttribute('data-reduce-motion');
  prefersDark = false;
});

describe('mode themes', () => {
  it('applies light and dark explicitly', () => {
    applyTheme('dark', '');
    expect(root().classList.contains('dark')).toBe(true);
    applyTheme('light', '');
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('follows the OS in system mode, in both directions', () => {
    prefersDark = true;
    applyTheme('system', '');
    expect(root().classList.contains('dark')).toBe(true);
    prefersDark = false;
    applyTheme('system', '');
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('sets no inline overrides, so the stylesheet tokens drive everything', () => {
    applyTheme('dark', '');
    expect(root().getAttribute('style')).toBeNull();
  });
});

describe('switching away from a custom colour resets completely', () => {
  it('clears every override', () => {
    // The module's own claim ("switching color→mode must fully reset"). A leftover override would
    // silently poison the plain dark theme, and only on the surfaces that token touches.
    applyTheme('light', '#4c1d95');
    expect(cssVar('--surface-base')).not.toBe('');
    applyTheme('dark', '');
    for (const name of [
      '--surface-base',
      '--text-primary',
      '--text-secondary',
      '--border-focus',
      '--primary',
      '--primary-on-surface',
    ]) {
      expect(cssVar(name), name).toBe('');
    }
  });
});

describe('a custom theme colour still meets WCAG AA', () => {
  /** Assert the derived tokens against the surface they are rendered on. */
  function checkDerived(color: string): string[] {
    applyTheme('system', color);
    const base = cssVar('--surface-base');
    const problems: string[] = [];
    const text = (name: string): void => {
      const ratio = contrastRatio(cssVar(name), base);
      if (ratio < 4.5) problems.push(`${name} ${ratio.toFixed(2)}:1`);
    };
    const nonText = (name: string): void => {
      const ratio = contrastRatio(cssVar(name), base);
      if (ratio < 3) problems.push(`${name} ${ratio.toFixed(2)}:1`);
    };
    text('--text-primary');
    text('--text-secondary');
    text('--primary-on-surface');
    nonText('--border-focus');
    nonText('--primary');
    // The accent's own label sits on the accent, not on the page.
    const fg = contrastRatio(cssVar('--primary-fg'), cssVar('--primary'));
    if (fg < 4.5) problems.push(`--primary-fg on --primary ${fg.toFixed(2)}:1`);
    return problems;
  }

  it('holds for every preset Settings offers', () => {
    // Seven of these eight had a focus ring below 3:1 before the derivation solved for the ratio.
    for (const color of PRESETS) {
      expect(checkDerived(color), color).toEqual([]);
    }
  });

  it('holds for arbitrary colours the free picker accepts, including mid-tones and the extremes', () => {
    for (const color of ARBITRARY) {
      expect(checkDerived(color), color).toEqual([]);
    }
  });

  it('picks the text colour that actually contrasts better, not the one a threshold suggests', () => {
    // #808080 sits either side of 0.5 depending on which luminance formula is used. The question is
    // not which side it falls on — it is which of the two text colours wins, and that is measurable.
    applyTheme('system', '#808080');
    const base = cssVar('--surface-base');
    const chosen = cssVar('--text-primary');
    const other = chosen === '#f8fafc' ? '#0f172a' : '#f8fafc';
    expect(contrastRatio(chosen, base)).toBeGreaterThanOrEqual(contrastRatio(other, base));
  });

  it('ignores a malformed colour rather than deriving from garbage', () => {
    applyTheme('dark', 'not-a-color');
    expect(cssVar('--surface-base')).toBe('');
    expect(root().classList.contains('dark')).toBe(true);
  });
});

describe('luminance is WCAG relative luminance', () => {
  it('anchors at black and white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 9);
    expect(luminance('#ffffff')).toBeCloseTo(1, 9);
  });

  it('linearizes: mid grey is ~0.22, not ~0.5', () => {
    // The old implementation averaged raw channels and returned 0.502 here, which is what made the
    // light/dark decision wrong for every mid-tone.
    expect(luminance('#808080')).toBeCloseTo(0.2159, 3);
  });
});

describe('isHexColor', () => {
  it('accepts a 6-digit hex and rejects everything else', () => {
    expect(isHexColor('#0d7377')).toBe(true);
    expect(isHexColor('#0D7377')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('0d7377')).toBe(false);
    expect(isHexColor('rgb(1,2,3)')).toBe(false);
  });
});

describe('describeThemeColor reads out the same derivation applyTheme applies', () => {
  it('reports exactly the tokens that get set, for a dark and a light surface', () => {
    // The picker's hint promises "text contrast is chosen automatically". The read-out is only worth
    // anything if it is the SAME derivation — a second implementation that drifted would show a
    // number the screen does not actually render.
    for (const color of ['#1e293b', '#e0e0e0']) {
      applyTheme('system', color);
      const report = describeThemeColor(color);
      expect(report, color).not.toBeNull();
      expect(report!.surface, color).toBe(cssVar('--surface-base'));
      expect(report!.raised, color).toBe(cssVar('--surface-raised'));
      expect(report!.text, color).toBe(cssVar('--text-primary'));
      expect(report!.secondaryText, color).toBe(cssVar('--text-secondary'));
      expect(report!.accent, color).toBe(cssVar('--border-focus'));
    }
  });

  it('raises a dark surface toward white and a light surface toward black', () => {
    // `raised` is the one token whose direction flips with the chosen text colour, and the flip is
    // what makes a raised card read as raised rather than as a smudge.
    const dark = describeThemeColor('#1e293b')!;
    expect(luminance(dark.raised)).toBeGreaterThan(luminance(dark.surface));
    const light = describeThemeColor('#e0e0e0')!;
    expect(luminance(light.raised)).toBeLessThan(luminance(light.surface));
  });

  it('reports ratios that clear the bars the derivation solves for', () => {
    const r = describeThemeColor('#0d7377')!;
    expect(r.textRatio).toBeGreaterThanOrEqual(4.5);
    expect(r.accentRatio).toBeGreaterThanOrEqual(3);
    expect(r.accentLabelRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('returns null for the same input applyTheme ignores', () => {
    expect(describeThemeColor('not-a-color')).toBeNull();
    expect(describeThemeColor('')).toBeNull();
  });
});

describe('applyMotionPreference only ever ADDS a reason to reduce motion', () => {
  it('marks the document when forced on', () => {
    applyMotionPreference(true);
    expect(root().getAttribute('data-reduce-motion')).toBe('1');
  });

  it('removes the attribute when turned off, rather than asserting "full motion"', () => {
    // `tokens.css` honours `prefers-reduced-motion` on its own. Writing a falsy value here would let
    // the browser override an accessibility setting the user already made at the OS level; removing
    // the attribute hands the decision back.
    applyMotionPreference(true);
    applyMotionPreference(false);
    expect(root().hasAttribute('data-reduce-motion')).toBe(false);
  });

  it('is idempotent in both directions', () => {
    applyMotionPreference(true);
    applyMotionPreference(true);
    expect(root().getAttribute('data-reduce-motion')).toBe('1');
    applyMotionPreference(false);
    applyMotionPreference(false);
    expect(root().hasAttribute('data-reduce-motion')).toBe(false);
  });
});
