import { describe, expect, it } from 'vitest';
import {
  buildOmniboxSuggestions,
  looksNavigable,
  MAX_OMNIBOX_SUGGESTIONS,
  parseOmniboxQuery,
  type OmniboxSuggestSources,
} from './omnibox-suggest';

const LABELS = { search: 'Search the web', switchToTab: 'Switch to tab' };

const SOURCES: OmniboxSuggestSources = {
  tabs: [
    { id: 't1', title: 'GitHub', url: 'https://github.com' },
    { id: 't2', title: 'Example Domain', url: 'https://example.com' },
  ],
  history: [
    { url: 'https://example.com/blog', title: 'Example Blog', visitCount: 9 },
    { url: 'https://example.org', title: 'Example Org', visitCount: 2 },
    { url: 'https://news.ycombinator.com', title: 'Hacker News', visitCount: 20 },
  ],
};

describe('parseOmniboxQuery', () => {
  it('detects tab: and history: scope prefixes (case-insensitive) and trims the term', () => {
    expect(parseOmniboxQuery('tab: github')).toEqual({ scope: 'tab', term: 'github' });
    expect(parseOmniboxQuery('HISTORY:blog')).toEqual({ scope: 'history', term: 'blog' });
  });

  it('treats a prefix-free query as the "all" scope', () => {
    expect(parseOmniboxQuery('example')).toEqual({ scope: 'all', term: 'example' });
  });
});

describe('looksNavigable', () => {
  it('recognises URLs, dotted hosts, localhost and host:port', () => {
    for (const s of ['https://x.com', 'example.com', 'example.com/path', 'localhost:3000', '192.168.1.1'])
      expect(looksNavigable(s)).toBe(true);
  });

  it('treats free text (spaces / bare words) as a search', () => {
    for (const s of ['hello world', 'weather', 'buy milk']) expect(looksNavigable(s)).toBe(false);
  });
});

describe('buildOmniboxSuggestions', () => {
  it('returns nothing for an empty query', () => {
    expect(buildOmniboxSuggestions('   ', SOURCES, LABELS)).toEqual([]);
  });

  it('puts a search suggestion first for free text, then matching tabs/history', () => {
    const out = buildOmniboxSuggestions('example', SOURCES, LABELS);
    expect(out[0]).toMatchObject({ kind: 'search', action: { type: 'navigate', input: 'example' } });
    expect(out.some((s) => s.kind === 'tab' && s.action.type === 'activateTab')).toBe(true);
    expect(out.some((s) => s.kind === 'history')).toBe(true);
  });

  it('puts a navigate (not search) suggestion first when the text looks like a URL', () => {
    const out = buildOmniboxSuggestions('example.com', SOURCES, LABELS);
    expect(out[0]).toMatchObject({ kind: 'navigate', action: { type: 'navigate', input: 'example.com' } });
  });

  it('ranks history by visit count (most-visited first)', () => {
    const out = buildOmniboxSuggestions('example', SOURCES, LABELS).filter((s) => s.kind === 'history');
    expect(out[0]?.subtitle).toBe('https://example.com/blog'); // visitCount 9 before 2
  });

  it('tab: scope only returns open tabs and drops the primary action', () => {
    const out = buildOmniboxSuggestions('tab:git', SOURCES, LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'tab', action: { type: 'activateTab', tabId: 't1' } });
  });

  it('history: scope only returns history rows', () => {
    const out = buildOmniboxSuggestions('history:hacker', SOURCES, LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'history', title: 'Hacker News' });
  });

  it('collapses a history row that duplicates the typed URL', () => {
    const sources: OmniboxSuggestSources = {
      tabs: [],
      history: [{ url: 'https://example.com/blog', title: 'Example Blog', visitCount: 5 }],
    };
    const out = buildOmniboxSuggestions('https://example.com/blog', sources, LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('navigate');
  });

  it('caps the list length', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      url: `https://site${i}.com`,
      title: `Site ${i} match`,
      visitCount: i,
    }));
    const out = buildOmniboxSuggestions('match', { tabs: [], history }, LABELS);
    expect(out.length).toBeLessThanOrEqual(MAX_OMNIBOX_SUGGESTIONS);
  });
});
