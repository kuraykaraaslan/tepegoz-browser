import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrastRatio, mixTowardBlack } from './contrast';

/**
 * WCAG 2.2 AA contrast, measured against the real design tokens in both themes.
 *
 * This is the half of accessibility that can be *computed* rather than reviewed, so it should be a
 * gate rather than a periodic audit — and it found real failures when it was first run, all in the
 * light theme: secondary text at 4.32:1 on the Settings/History/Extensions background, the focus ring
 * at 2.67:1 (WCAG 1.4.11 wants 3:1 of the one indicator a keyboard user has), the danger button's
 * white label at 3.76:1, `text-warning` at 2.15:1 on the proxy-security warning, and the brand cyan at
 * 2.43:1 inside a primary Badge.
 *
 * The pairs below are the ones the components actually put together — checking every possible
 * combination would flag pairs nobody renders and train people to add exceptions.
 */

const TOKENS = readFileSync(join(__dirname, '..', '..', 'styles', 'tokens.css'), 'utf8');

/** Read one custom property out of a `:root` / `.dark` block. */
function block(selector: string): Record<string, string> {
  const start = TOKENS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in tokens.css`);
  const end = TOKENS.indexOf('\n}', start);
  const out: Record<string, string> = {};
  for (const line of TOKENS.slice(start, end).split('\n')) {
    const m = /^\s*--([a-z0-9-]+):\s*([^;]+);/.exec(line);
    if (m !== null) out[m[1] as string] = (m[2] as string).trim();
  }
  return out;
}

const light = block(':root');
const dark = { ...light, ...block('.dark') };

/** Resolve a token to a literal colour, evaluating the two indirections the file uses. */
function resolve(theme: Record<string, string>, name: string): string {
  const raw = theme[name];
  if (raw === undefined) throw new Error(`token --${name} is not defined`);
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(raw);
  if (alias !== null) return resolve(theme, alias[1] as string);
  const mix = /^color-mix\(in srgb, var\(--([a-z0-9-]+)\) (\d+)%, #000\)$/.exec(raw);
  if (mix !== null) return mixTowardBlack(resolve(theme, mix[1] as string), Number(mix[2]));
  return raw;
}

/** Foreground/background pairs the components render, with the rule that applies to each. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['text-primary', 'surface-base'],
  ['text-primary', 'surface-raised'],
  ['text-primary', 'surface-overlay'],
  ['text-primary', 'surface-sunken'],
  ['text-primary', 'surface-system'],
  ['text-secondary', 'surface-base'],
  ['text-secondary', 'surface-raised'],
  ['text-secondary', 'surface-overlay'],
  ['text-secondary', 'surface-system'],
  // Filled controls: the label sits on the fill.
  ['primary-fg', 'primary'],
  ['secondary-fg', 'secondary'],
  ['text-inverse', 'error'], // Button variant="danger", the notification count badge
  // Banner / badge pairs.
  ['success-fg', 'success-subtle'],
  ['warning-fg', 'warning-subtle'],
  ['error-fg', 'error-subtle'],
  ['info-fg', 'info-subtle'],
  ['primary-on-surface', 'primary-subtle'],
  // Semantic colours used as TEXT on an ordinary surface.
  ['error', 'surface-raised'],
  ['error', 'surface-system'],
  ['warning', 'surface-base'],
  ['success', 'surface-base'],
  ['info', 'surface-base'],
  ['primary-on-surface', 'surface-base'],
  ['primary-on-surface', 'surface-system'],
];

/** Non-text: focus rings and status glyphs. WCAG 1.4.11 — 3:1. */
const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['border-focus', 'surface-base'],
  ['border-focus', 'surface-raised'],
  ['border-focus', 'surface-overlay'],
  ['success', 'surface-raised'],
  ['error', 'surface-base'],
];

function failures(
  theme: Record<string, string>,
  pairs: readonly (readonly [string, string])[],
  floor: number,
): string[] {
  return pairs.flatMap(([fg, bg]) => {
    const ratio = contrastRatio(resolve(theme, fg), resolve(theme, bg));
    return ratio < floor ? [`${fg} on ${bg}: ${ratio.toFixed(2)}:1 (needs ${String(floor)})`] : [];
  });
}

describe('every rendered colour pair meets WCAG 2.2 AA', () => {
  it('reads the tokens (the gate is not silently checking an empty set)', () => {
    expect(Object.keys(light).length).toBeGreaterThan(20);
    expect(resolve(light, 'surface-system')).toMatch(/^#[0-9a-f]{6}$/);
    // `.dark` overrides, it does not restate every token — inheritance has to work or the dark run
    // would silently measure light values.
    expect(resolve(dark, 'surface-base')).not.toBe(resolve(light, 'surface-base'));
  });

  it('passes 4.5:1 for text in the light theme', () => {
    expect(failures(light, TEXT_PAIRS, AA_TEXT)).toEqual([]);
  });

  it('passes 4.5:1 for text in the dark theme', () => {
    expect(failures(dark, TEXT_PAIRS, AA_TEXT)).toEqual([]);
  });

  it('passes 3:1 for focus rings and status glyphs in both themes', () => {
    expect(failures(light, NON_TEXT_PAIRS, AA_NON_TEXT)).toEqual([]);
    expect(failures(dark, NON_TEXT_PAIRS, AA_NON_TEXT)).toEqual([]);
  });
});
