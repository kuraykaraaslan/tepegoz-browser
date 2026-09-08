import { describe, expect, it } from 'vitest';
import { serializeHistoryCsv } from './history-export';

const row = (over: Partial<{ url: string; title: string; ts: number; visitCount: number }> = {}) => ({
  url: 'https://example.com/',
  title: 'Example',
  ts: Date.parse('2026-09-08T10:00:00.000Z'),
  visitCount: 3,
  ...over,
});

describe('serializeHistoryCsv', () => {
  it('writes the header even when there are no rows', () => {
    expect(serializeHistoryCsv([])).toBe('url,title,last_visited,visit_count\r\n');
  });

  it('writes one CRLF-terminated line per row with an ISO timestamp', () => {
    const out = serializeHistoryCsv([row()]);
    expect(out).toBe(
      'url,title,last_visited,visit_count\r\n' +
        'https://example.com/,Example,2026-09-08T10:00:00.000Z,3\r\n',
    );
  });

  it('RFC-4180 quotes a field with a comma, a quote, or a newline; doubles inner quotes', () => {
    const out = serializeHistoryCsv([
      row({ title: 'a, b "c"\nd', url: 'https://x/?q=1,2' }),
    ]);
    const line = out.split('\r\n')[1]!;
    expect(line).toBe('"https://x/?q=1,2","a, b ""c""\nd",2026-09-08T10:00:00.000Z,3');
  });

  it('neutralizes a spreadsheet formula-injection title (leading = + - @)', () => {
    const out = serializeHistoryCsv([row({ title: '=HYPERLINK("http://evil")' })]);
    // prefixed with a quote so Excel/Sheets treat it as text, then CSV-quoted for the inner quotes
    expect(out.split('\r\n')[1]).toContain("\"'=HYPERLINK(");
  });

  it('leaves last_visited blank for a non-finite timestamp rather than writing "Invalid Date"', () => {
    const out = serializeHistoryCsv([row({ ts: Number.NaN })]);
    expect(out.split('\r\n')[1]).toBe('https://example.com/,Example,,3');
  });
});
