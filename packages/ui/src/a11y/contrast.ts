/**
 * WCAG relative luminance and contrast ratio, from the spec's own formulas.
 *
 * Small enough to implement rather than depend on: the algorithm is four lines and has not changed
 * since WCAG 2.0, and a design-token gate that pulls in a package to compute a ratio is a gate people
 * remove the next time the dependency audit runs.
 */

/** sRGB channel → linear light. The 0.03928 knee and 2.4 exponent are the spec's, not an approximation. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Parse `#rrggbb` (or `#rgb`) to its three channels. Throws on anything else — a token that is not a
 *  literal colour must fail loudly rather than silently score as black. */
export function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio, 1–21. Order-independent, exactly as WCAG defines it. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `color-mix(in srgb, <hex> <pct>%, #000)` — the one CSS function the token file uses.
 *
 * `--surface-system` is derived rather than literal so a custom theme colour carries through to the
 * internal pages. That derivation has to be evaluated here too, or the background those pages actually
 * paint would be the one pair the contrast gate never checks.
 */
export function mixTowardBlack(hex: string, percent: number): string {
  const f = percent / 100;
  const mixed = parseHex(hex).map((c) => Math.round(c * f));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.x thresholds. 3:1 covers large text (1.4.3) and non-text UI (1.4.11) alike. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
