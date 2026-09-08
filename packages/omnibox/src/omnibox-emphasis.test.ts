import { describe, expect, it } from 'vitest';
import { emphasisRanges, emphasisSegments, type EmphasisSegment } from './omnibox-emphasis';

/** Re-join segments so every case can assert the split is lossless. */
const rejoin = (segs: EmphasisSegment[]): string => segs.map((s) => s.text).join('');
const matchedText = (segs: EmphasisSegment[]): string[] =>
  segs.filter((s) => s.match).map((s) => s.text);

describe('emphasisRanges', () => {
  it('finds a single case-insensitive match and reports original-string offsets', () => {
    expect(emphasisRanges('Example Domain', 'exam')).toEqual([{ start: 0, end: 4 }]);
    expect(emphasisRanges('Example Domain', 'DOMAIN')).toEqual([{ start: 8, end: 14 }]);
  });

  it('returns [] when nothing matches', () => {
    expect(emphasisRanges('Example Domain', 'zzz')).toEqual([]);
  });

  it('returns [] for an empty query', () => {
    expect(emphasisRanges('Example Domain', '')).toEqual([]);
    expect(emphasisRanges('Example Domain', '   ')).toEqual([]);
  });

  it('returns [] when the query is longer than the text', () => {
    expect(emphasisRanges('abc', 'abcdef')).toEqual([]);
  });

  it('finds every occurrence, including overlapping ones', () => {
    expect(emphasisRanges('a-b-a', 'a')).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ]);
    // "aa" overlaps at 0 and 1 → one merged run covering the whole string.
    expect(emphasisRanges('aaa', 'aa')).toEqual([{ start: 0, end: 3 }]);
  });

  it('maps back to original indices when folding changes length (İ → i)', () => {
    // `İ`.toLowerCase() is `i` + combining dot; the fold strips the mark. The range must still be the
    // one original code point, not the two fold-space units.
    expect(emphasisRanges('İ', 'i')).toEqual([{ start: 0, end: 1 }]);
    expect(emphasisRanges('İstanbul', 'istanbul')).toEqual([{ start: 0, end: 8 }]);
  });
});

describe('emphasisSegments', () => {
  it('returns [] for empty text', () => {
    expect(emphasisSegments('', 'anything')).toEqual([]);
  });

  it('returns a single unmatched segment when there is no match or no query', () => {
    expect(emphasisSegments('Example', 'zzz')).toEqual([{ text: 'Example', match: false }]);
    expect(emphasisSegments('Example', '')).toEqual([{ text: 'Example', match: false }]);
  });

  it('splits leading / matched / trailing runs and stays lossless', () => {
    const segs = emphasisSegments('Example Domain', 'ample');
    expect(segs).toEqual([
      { text: 'Ex', match: false },
      { text: 'ample', match: true },
      { text: ' Domain', match: false },
    ]);
    expect(rejoin(segs)).toBe('Example Domain');
  });

  it('emphasises multiple occurrences', () => {
    const segs = emphasisSegments('go go go', 'go');
    expect(matchedText(segs)).toEqual(['go', 'go', 'go']);
    expect(rejoin(segs)).toBe('go go go');
  });

  it('emphasises a URL secondary line the same way', () => {
    const segs = emphasisSegments('https://example.com/blog', 'example');
    expect(segs).toEqual([
      { text: 'https://', match: false },
      { text: 'example', match: true },
      { text: '.com/blog', match: false },
    ]);
    expect(rejoin(segs)).toBe('https://example.com/blog');
  });

  it('is Turkish- and accent-correct: "sisli" emphasises "Şişli"', () => {
    expect(emphasisSegments('Şişli', 'sisli')).toEqual([{ text: 'Şişli', match: true }]);
    const segs = emphasisSegments('Şişli Belediyesi', 'sisli');
    expect(segs).toEqual([
      { text: 'Şişli', match: true },
      { text: ' Belediyesi', match: false },
    ]);
    expect(rejoin(segs)).toBe('Şişli Belediyesi');
  });

  it('matches a dotless-ı query against a dotted-i title (fold collapses the i family)', () => {
    expect(emphasisSegments('Isparta', 'ısparta')).toEqual([{ text: 'Isparta', match: true }]);
  });
});
