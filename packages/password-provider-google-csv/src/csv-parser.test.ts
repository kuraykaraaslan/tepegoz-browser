import { describe, it, expect } from 'vitest';
import { parseGoogleCsv, serializeGoogleCsv, type CsvRow } from './csv-parser';

const HEADER = 'name,url,username,password,note';

describe('parseGoogleCsv', () => {
  it('parses a standard Google export with a header row', () => {
    const csv = [
      HEADER,
      'Example,https://example.com,alice,s3cret,my note',
      'Bank,https://bank.test,bob,hunter2,',
    ].join('\n');

    expect(parseGoogleCsv(csv)).toEqual([
      { name: 'Example', url: 'https://example.com', username: 'alice', password: 's3cret', note: 'my note' },
      { name: 'Bank', url: 'https://bank.test', username: 'bob', password: 'hunter2', note: '' },
    ]);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(parseGoogleCsv('')).toEqual([]);
    expect(parseGoogleCsv('\n\n  \n')).toEqual([]);
  });

  it('treats the first line as data when no header is present', () => {
    const csv = 'Site,https://a.test,carol,pw,';
    expect(parseGoogleCsv(csv)).toEqual([
      { name: 'Site', url: 'https://a.test', username: 'carol', password: 'pw', note: '' },
    ]);
  });

  it('skips rows missing url, username, or password', () => {
    const csv = [
      HEADER,
      ',https://a.test,,pw,',            // no username
      'Name,,user,pw,',                  // no url
      'Name,https://b.test,user,,',      // no password
      'Ok,https://c.test,user,pw,',      // valid
    ].join('\n');
    expect(parseGoogleCsv(csv)).toEqual([
      { name: 'Ok', url: 'https://c.test', username: 'user', password: 'pw', note: '' },
    ]);
  });

  it('handles quoted fields containing commas and escaped quotes', () => {
    const csv = [
      HEADER,
      '"Acme, Inc.",https://acme.test,dave,"pa,ss""word","line1"',
    ].join('\n');
    expect(parseGoogleCsv(csv)).toEqual([
      { name: 'Acme, Inc.', url: 'https://acme.test', username: 'dave', password: 'pa,ss"word', note: 'line1' },
    ]);
  });

  it('tolerates trailing carriage returns (CRLF files)', () => {
    const csv = `${HEADER}\r\nName,https://a.test,user,pw,note\r\n`;
    expect(parseGoogleCsv(csv)).toEqual([
      { name: 'Name', url: 'https://a.test', username: 'user', password: 'pw', note: 'note' },
    ]);
  });
});

describe('serializeGoogleCsv', () => {
  it('emits a header even when there are no rows', () => {
    expect(serializeGoogleCsv([])).toBe(HEADER);
  });

  it('quotes and escapes fields with commas, quotes, or newlines', () => {
    const rows: CsvRow[] = [
      { name: 'Acme, Inc.', url: 'https://acme.test', username: 'dave', password: 'pa"ss', note: 'a\nb' },
    ];
    expect(serializeGoogleCsv(rows)).toBe(
      `${HEADER}\n"Acme, Inc.",https://acme.test,dave,"pa""ss","a\nb"`,
    );
  });

  it('round-trips through parse without loss', () => {
    const rows: CsvRow[] = [
      { name: 'A, B', url: 'https://x.test', username: 'u1', password: 'p"1', note: 'n' },
      { name: 'Plain', url: 'https://y.test', username: 'u2', password: 'p2', note: '' },
    ];
    expect(parseGoogleCsv(serializeGoogleCsv(rows))).toEqual(rows);
  });
});
