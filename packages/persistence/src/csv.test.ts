import { describe, expect, it } from 'vitest';
import { csvField } from './csv';

describe('csvField', () => {
  it('leaves a plain value untouched', () => {
    expect(csvField('hello world')).toBe('hello world');
  });

  it('RFC-4180 quotes a comma, a quote, CR or LF and doubles inner quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('prefixes a leading =/+/-/@ (and tab/CR) with a quote so a spreadsheet treats it as text', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@x')).toBe("'@x");
    expect(csvField('\tx')).toBe("'\tx");
  });

  it('quotes the guarded value when the guard prefix introduces nothing needing quotes', () => {
    // `=HYPERLINK("evil")` → `'=HYPERLINK("evil")` → CSV-quoted for the inner quotes
    expect(csvField('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
  });
});
