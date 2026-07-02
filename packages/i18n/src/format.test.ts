import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatCurrency,
  formatList,
  formatRelativeTime,
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

  it('selects the correct CLDR plural category', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(2, 'en')).toBe('other');
    // CLDR Turkish cardinals DO have 'one' (n = 1); it's the ORDINAL rules that collapse to 'other'.
    expect(pluralCategory(1, 'tr')).toBe('one');
    expect(pluralCategory(5, 'tr')).toBe('other');
    expect(selectPlural(2, 'en', { one: '1 item', other: 'many items' })).toBe('many items');
  });
});
