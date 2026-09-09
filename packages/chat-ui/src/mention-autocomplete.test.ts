import { describe, expect, it } from 'vitest';
import { applyMention, findMentionQuery, rankMentionCandidates } from './mention-autocomplete';

describe('findMentionQuery', () => {
  it('finds a token at the start or after whitespace', () => {
    expect(findMentionQuery('@ad', 3)).toEqual({ prefix: 'ad', start: 0, end: 3 });
    expect(findMentionQuery('hi @bo', 6)).toEqual({ prefix: 'bo', start: 3, end: 6 });
    expect(findMentionQuery('(@ali', 5)).toEqual({ prefix: 'ali', start: 1, end: 5 });
  });

  it('handles an empty token right after @', () => {
    expect(findMentionQuery('hey @', 5)).toEqual({ prefix: '', start: 4, end: 5 });
  });

  it('returns null when the caret is not in a mention', () => {
    expect(findMentionQuery('plain text', 5)).toBeNull();
    expect(findMentionQuery('mail@host', 9)).toBeNull(); // @ not at a boundary
    expect(findMentionQuery('@a b', 4)).toBeNull(); // caret past a space
    expect(findMentionQuery('', 0)).toBeNull();
  });
});

describe('rankMentionCandidates', () => {
  const nicks = ['Ada', 'Adam', 'Bea', 'çınar', 'Cem'];

  it('prefix matches first, then substring, both sorted, fold-aware', () => {
    expect(rankMentionCandidates(nicks, 'ad')).toEqual(['Ada', 'Adam']);
    // "Bea" and "çınar" (folds to "cinar") both contain an "a"
    expect(rankMentionCandidates(nicks, 'A')).toEqual(['Ada', 'Adam', 'Bea', 'çınar']);
    expect(rankMentionCandidates(nicks, 'CIN')).toEqual(['çınar']); // Turkish fold
  });

  it('with an empty prefix returns every nick, sorted, capped', () => {
    expect(rankMentionCandidates(nicks, '', 3)).toEqual(['Ada', 'Adam', 'Bea']);
  });
});

describe('applyMention', () => {
  it('splices "@nick " in and moves the caret past it', () => {
    const query = findMentionQuery('hi @ad end', 6);
    expect(query).not.toBeNull();
    if (query === null) return;
    expect(applyMention('hi @ad end', query, 'Adam')).toEqual({ text: 'hi @Adam  end', caret: 9 });
  });
});
