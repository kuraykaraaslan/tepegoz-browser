import { describe, it, expect } from 'vitest';
import { toQuery, xpathLiteral, KEY_MAP } from './cdp-selectors';

describe('xpathLiteral', () => {
  it('double-quotes plain text', () => {
    expect(xpathLiteral('hello')).toBe('"hello"');
  });
  it('single-quotes text containing a double quote', () => {
    expect(xpathLiteral('say "hi"')).toBe(`'say "hi"'`);
  });
  it('uses concat() when both quote kinds are present', () => {
    expect(xpathLiteral(`a"b'c`)).toContain('concat(');
  });
});

describe('toQuery', () => {
  it('passes CSS through as a css query', () => {
    expect(toQuery({ kind: 'css', value: '#id' })).toEqual({ method: 'css', query: '#id' });
  });
  it('exact text → normalized equality xpath', () => {
    expect(toQuery({ kind: 'text', value: 'OK' })).toEqual({
      method: 'xpath',
      query: '//*[normalize-space(.)="OK"]',
    });
  });
  it('wildcard text → contains() xpath', () => {
    expect(toQuery({ kind: 'text', value: 'OK', wildcard: true }).query).toContain('contains(');
  });
  it('attr selector → attribute-equality xpath with the given attr name', () => {
    expect(toQuery({ kind: 'attr', value: 'v', attr: 'data-x' })).toEqual({
      method: 'xpath',
      query: '//*[@data-x="v"]',
    });
  });
});

describe('KEY_MAP', () => {
  it('maps Enter to its CDP key fields with a carriage-return text', () => {
    expect(KEY_MAP['Enter']).toEqual({ key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' });
  });
  it('has no text for a non-printable navigation key', () => {
    expect(KEY_MAP['ArrowDown']?.text).toBeUndefined();
  });
});
