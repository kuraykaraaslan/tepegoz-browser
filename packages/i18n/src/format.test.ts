import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateByFormat,
  formatList,
  formatNumber,
  formatRelativeTime,
  formatTime,
  pluralCategory,
  selectPlural,
} from './format';

describe('locale-aware formatting', () => {
  it('formats numbers with locale grouping/decimal separators', () => {
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
    // Turkish uses '.' for thousands and ',' for the decimal.
    expect(formatNumber(1234567.5, 'tr')).toBe('1.234.567,5');
  });

  it('formats currency per locale', () => {
    expect(formatCurrency(1000, 'en', 'USD')).toContain('1,000');
    expect(formatCurrency(1000, 'tr', 'TRY')).toContain('1.000');
  });

  it('joins lists with the locale conjunction', () => {
    expect(formatList(['a', 'b', 'c'], 'en')).toBe('a, b, and c');
    expect(formatList(['a', 'b', 'c'], 'tr')).toBe('a, b ve c');
  });

  it('formats relative time picking a sensible unit (deterministic `now`)', () => {
    const now = new Date('2026-07-02T12:00:00Z').getTime();
    expect(formatRelativeTime(now - 60_000, 'en', now)).toBe('1 minute ago');
    expect(formatRelativeTime(now + 24 * 3600_000, 'en', now)).toBe('tomorrow');
  });

  it('formats a date / time in the locale (default styles)', () => {
    const d = new Date('2026-07-02T09:05:00Z');
    // dateStyle:'medium' — locale controls order/month name; assert the year is present, not an exact
    // string (Intl output varies by ICU version).
    expect(formatDate(d, 'en')).toContain('2026');
    expect(formatDate(d.getTime(), 'tr')).toContain('2026');
    expect(formatTime(d, 'en')).toMatch(/\d/);
    expect(formatDate(d, 'en', { year: 'numeric' })).toBe('2026');
  });

  it('formatDateByFormat renders every fixed-order pattern and the Intl presets', () => {
    const d = new Date(2026, 6, 2); // 2 Jul 2026, local time
    expect(formatDateByFormat(d, 'en', 'iso')).toBe('2026-07-02');
    expect(formatDateByFormat(d.getTime(), 'en', 'dmy-slash')).toBe('02/07/2026');
    expect(formatDateByFormat(d, 'en', 'mdy-slash')).toBe('07/02/2026');
    expect(formatDateByFormat(d, 'en', 'dmy-dot')).toBe('02.07.2026');
    expect(formatDateByFormat(d, 'en', 'd-mmm-y')).toBe('2 Jul 2026');
    // The four Intl dateStyle presets take the DATE_STYLE_IDS branch.
    expect(formatDateByFormat(d, 'en', 'full')).toContain('2026');
    // An unknown id falls back to the medium preset.
    expect(formatDateByFormat(d, 'en', 'no-such-format')).toContain('2026');
  });

  it('selects the correct CLDR plural category', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(2, 'en')).toBe('other');
    // CLDR Turkish cardinals DO have 'one' (n = 1); it's the ORDINAL rules that collapse to 'other'.
    expect(pluralCategory(1, 'tr')).toBe('one');
    expect(pluralCategory(5, 'tr')).toBe('other');
    expect(selectPlural(2, 'en', { one: '1 item', other: 'many items' })).toBe('many items');
  });
});
