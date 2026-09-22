import { describe, expect, it } from 'vitest';
import { AppError } from '@tepegoz/libs';
import {
  buildWholeWordPattern,
  escapeRegExpLiteral,
  WHOLE_WORD_QUERY_MAX_LENGTH,
} from './whole-word-pattern';

describe('escapeRegExpLiteral', () => {
  it('leaves ordinary text untouched', () => {
    expect(escapeRegExpLiteral('cat')).toBe('cat');
    expect(escapeRegExpLiteral('İzmir')).toBe('İzmir');
  });

  it('escapes every regex metacharacter', () => {
    expect(escapeRegExpLiteral('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
    );
  });

  it('escapes metacharacters embedded in an otherwise ordinary query', () => {
    expect(escapeRegExpLiteral('c++')).toBe('c\\+\\+');
    expect(escapeRegExpLiteral('a.b')).toBe('a\\.b');
  });
});

describe('buildWholeWordPattern', () => {
  it('wraps the escaped query in \\b anchors', () => {
    expect(buildWholeWordPattern('cat', false)).toEqual({ source: '\\bcat\\b', flags: 'gi' });
  });

  it('escapes metacharacters before anchoring, so they cannot break out of the pattern', () => {
    expect(buildWholeWordPattern('c++', false).source).toBe('\\bc\\+\\+\\b');
  });

  it('uses "gi" when matchCase is false and "g" when it is true', () => {
    expect(buildWholeWordPattern('cat', false).flags).toBe('gi');
    expect(buildWholeWordPattern('cat', true).flags).toBe('g');
  });

  it('rejects an empty query', () => {
    expect(() => buildWholeWordPattern('', false)).toThrow(AppError);
  });

  it('rejects a query over the length cap (the ReDoS guard)', () => {
    const tooLong = 'a'.repeat(WHOLE_WORD_QUERY_MAX_LENGTH + 1);
    expect(() => buildWholeWordPattern(tooLong, false)).toThrow(AppError);
  });

  it('accepts a query exactly at the length cap', () => {
    const atCap = 'a'.repeat(WHOLE_WORD_QUERY_MAX_LENGTH);
    expect(() => buildWholeWordPattern(atCap, false)).not.toThrow();
  });

  it('the resulting pattern actually matches whole words only', () => {
    const { source, flags } = buildWholeWordPattern('cat', false);
    const re = new RegExp(source, flags);
    expect('the cat sat'.match(re)).toBeTruthy();
    expect('category error'.match(re)).toBeNull();
    expect('concat'.match(re)).toBeNull();
    expect('CAT'.match(re)).toBeTruthy(); // case-insensitive by default
  });

  it('is case-sensitive when matchCase is true', () => {
    const { source, flags } = buildWholeWordPattern('Cat', true);
    const re = new RegExp(source, flags);
    expect('a Cat sat'.match(re)).toBeTruthy();
    expect('a cat sat'.match(re)).toBeNull();
  });

  it('finds every occurrence with the global flag, not just the first', () => {
    const { source, flags } = buildWholeWordPattern('cat', false);
    const re = new RegExp(source, flags);
    expect('cat cat cat'.match(re)).toHaveLength(3);
  });
});
