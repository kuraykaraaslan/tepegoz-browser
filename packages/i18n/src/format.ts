import type { Locale } from './index';

/**
 * Locale-aware formatting (Phase 0 i18n infra). Thin wrappers over the platform `Intl` APIs so every
 * surface renders dates/numbers/plurals/relative-times/lists in the active locale — no hand-rolled,
 * en-only formatting. Pure + dependency-free; `Intl` ships with Node ≥ 22 and Chromium.
 *
 * BCP-47 note: our `Locale` union (`en`/`tr`) is already valid BCP-47, so it is passed to `Intl`
 * directly; when a region-specific tag is wanted later, widen the map here (one place).
 */

export function formatDate(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

/**
 * Selectable date formats for the `dateFormat` preference. The first four are locale-aware Intl
 * `dateStyle` presets (order/month-name follow the locale); the rest are fixed-order concrete
 * patterns (numeric order is fixed; any month name still comes from `Intl`, so it stays localized).
 */
export const DATE_FORMAT_IDS = [
  'short',
  'medium',
  'long',
  'full',
  'iso',
  'dmy-slash',
  'mdy-slash',
  'dmy-dot',
  'd-mmm-y',
] as const;
export type DateFormatId = (typeof DATE_FORMAT_IDS)[number];

const DATE_STYLE_IDS = new Set<string>(['short', 'medium', 'long', 'full']);

/**
 * Format a date per the stored `dateFormat` preference id. `locale` may be any BCP-47 tag (e.g.
 * `tr-DE`) so region-specific month names/ordering apply. Unknown ids fall back to `medium`.
 */
export function formatDateByFormat(value: Date | number, locale: string, format: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (DATE_STYLE_IDS.has(format)) {
    return new Intl.DateTimeFormat(locale, { dateStyle: format as 'short' | 'medium' | 'long' | 'full' }).format(d);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  switch (format) {
    case 'iso':
      return `${y}-${m}-${day}`;
    case 'dmy-slash':
      return `${day}/${m}/${y}`;
    case 'mdy-slash':
      return `${m}/${day}/${y}`;
    case 'dmy-dot':
      return `${day}.${m}.${y}`;
    case 'd-mmm-y':
      return `${d.getDate()} ${new Intl.DateTimeFormat(locale, { month: 'short' }).format(d)} ${y}`;
    default:
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  }
}

export function formatTime(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Currency helper (e.g. USD/TRY); the symbol + grouping follow the locale. */
export function formatCurrency(value: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/**
 * Human relative time from `from` (default: now) to `value`, auto-picking the largest sensible unit
 * (e.g. "3 minutes ago", "yarın"). `now` is injected for testability/determinism.
 */
export function formatRelativeTime(
  value: Date | number,
  locale: Locale,
  now: Date | number = Date.now(),
): string {
  const toMs = value instanceof Date ? value.getTime() : value;
  const fromMs = now instanceof Date ? now.getTime() : now;
  const diffSec = Math.round((toMs - fromMs) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let unitValue = diffSec;
  let chosen: Intl.RelativeTimeFormatUnit = 'second';
  let acc = abs;
  for (const [size, unit] of divisions) {
    chosen = unit;
    if (acc < size) break;
    unitValue = Math.round(unitValue / size);
    acc /= size;
  }
  return rtf.format(unitValue, chosen);
}

/** Locale-correct list joining ("a, b and c" / "a, b ve c"). */
export function formatList(
  items: string[],
  locale: Locale,
  options: Intl.ListFormatOptions = { style: 'long', type: 'conjunction' },
): string {
  return new Intl.ListFormat(locale, options).format(items);
}

/** The CLDR plural category for `count` in `locale` — use to select the right message variant. */
export function pluralCategory(
  count: number,
  locale: Locale,
  type: Intl.PluralRuleType = 'cardinal',
): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale, { type }).select(count);
}

/** Pick a message variant by plural category, falling back to `other` (which every locale defines). */
export function selectPlural(
  count: number,
  locale: Locale,
  variants: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  return variants[pluralCategory(count, locale)] ?? variants.other;
}
