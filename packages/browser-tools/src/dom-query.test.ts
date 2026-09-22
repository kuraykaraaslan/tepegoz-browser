import { describe, it, expect } from 'vitest';
import { summarizeQuery, MAX_QUERY_MATCHES, type QueryProbe } from './dom-query';

function probe(over: Partial<QueryProbe> = {}): QueryProbe {
  return { ok: true, total: 1, matches: [{ tag: 'div', ref: 3, attributes: { id: 'x' } }], ...over };
}

describe('summarizeQuery', () => {
  it('shapes an ordinary match into structured fields and a readable content block', () => {
    const report = summarizeQuery(probe(), '#x', 'css', 'https://site.test/');
    expect(report.ok).toBe(true);
    expect(report.count).toBe(1);
    expect(report.totalMatches).toBe(1);
    expect(report.truncated).toBe(false);
    expect(report.matches).toEqual([{ tag: 'div', ref: 3, attributes: { id: 'x' } }]);
    expect(report.content).toContain('<div ref=3 id="x">');
    expect(report.content).toContain('<untrusted_page_content');
    expect(report.query).toBe('#x');
    expect(report.queryType).toBe('css');
  });

  it('reports an honest failure (invalid selector/XPath) rather than throwing', () => {
    const report = summarizeQuery(
      { ok: false, error: "'#(' is not a valid selector", total: 0, matches: [] },
      '#(',
      'css',
      'https://site.test/',
    );
    expect(report.ok).toBe(false);
    expect(report.error).toContain('not a valid selector');
    expect(report.matches).toEqual([]);
    expect(report.count).toBe(0);
    expect(report.content).toContain('query failed');
  });

  it('renders ref: none for a match the host could not mint a ref for, never a fabricated number', () => {
    const report = summarizeQuery(
      probe({ matches: [{ tag: 'span', ref: null, attributes: {} }] }),
      'span',
      'css',
      'https://x',
    );
    expect(report.matches[0]?.ref).toBeNull();
    expect(report.content).toContain('<span ref=none>');
  });

  it('reports no matches honestly', () => {
    const report = summarizeQuery(probe({ total: 0, matches: [] }), '.missing', 'css', 'https://x');
    expect(report.count).toBe(0);
    expect(report.totalMatches).toBe(0);
    expect(report.truncated).toBe(false);
    expect(report.content).toContain('(no matches)');
  });

  it(`caps the listing at ${String(MAX_QUERY_MATCHES)} and reports truncated honestly`, () => {
    const many = Array.from({ length: MAX_QUERY_MATCHES + 25 }, (_, i) => ({
      tag: 'li',
      ref: i + 1,
      attributes: {},
    }));
    const report = summarizeQuery(
      { ok: true, total: MAX_QUERY_MATCHES + 25, matches: many },
      'li',
      'css',
      'https://x',
    );
    expect(report.count).toBe(MAX_QUERY_MATCHES);
    expect(report.totalMatches).toBe(MAX_QUERY_MATCHES + 25);
    expect(report.truncated).toBe(true);
  });

  it('caps and sanitizes an over-long or hostile attribute value (AI-5 fencing)', () => {
    const longValue = 'x'.repeat(5000);
    const report = summarizeQuery(
      probe({ matches: [{ tag: 'div', ref: 1, attributes: { title: longValue } }] }),
      'div',
      'css',
      'https://x',
    );
    expect(report.matches[0]?.attributes['title']?.length).toBeLessThanOrEqual(200);
    expect(report.content).toContain('</untrusted_page_content>');
    expect(report.content).toContain('untrusted web data');
  });

  it('caps the number of attributes rendered per element', () => {
    const attributes: Record<string, string> = {};
    for (let i = 0; i < 80; i++) attributes[`data-${String(i)}`] = 'v';
    const report = summarizeQuery(
      probe({ matches: [{ tag: 'div', ref: 1, attributes }] }),
      'div',
      'css',
      'https://x',
    );
    expect(Object.keys(report.matches[0]?.attributes ?? {}).length).toBeLessThanOrEqual(40);
  });

  it('an XPath match is labelled with the xpath queryType', () => {
    const report = summarizeQuery(probe(), '//div[@id="x"]', 'xpath', 'https://x');
    expect(report.queryType).toBe('xpath');
  });
});
