import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('maps the header row to record keys', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('handles quoted fields, escaped quotes, and embedded commas/newlines', () => {
    expect(parseCsv('name,note\n"Doe, John","he said ""hi"""')).toEqual([
      { name: 'Doe, John', note: 'he said "hi"' },
    ]);
  });

  it('treats CRLF as a row separator and skips fully-empty rows', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
