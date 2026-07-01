import { describe, it, expect } from 'vitest';
import { isTrustedAppUrl } from './trusted-origin';

describe('isTrustedAppUrl', () => {
  it('always trusts file:// (our own packaged app content)', () => {
    expect(isTrustedAppUrl('file:///C:/app/index.html', { isPackaged: true })).toBe(true);
    expect(isTrustedAppUrl('file:///app/index.html', { isPackaged: false })).toBe(true);
  });

  it('trusts the localhost dev server ONLY when not packaged', () => {
    expect(isTrustedAppUrl('http://localhost:5173/', { isPackaged: false })).toBe(true);
    expect(isTrustedAppUrl('http://127.0.0.1:5173/', { isPackaged: false })).toBe(true);
    expect(isTrustedAppUrl('http://localhost:5173/', { isPackaged: true })).toBe(false);
  });

  it('rejects spoofed hosts via exact host matching (not a string prefix)', () => {
    expect(isTrustedAppUrl('http://localhost.evil.com/', { isPackaged: false })).toBe(false);
    expect(isTrustedAppUrl('https://evil.com/?x=localhost', { isPackaged: false })).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isTrustedAppUrl('not a url', { isPackaged: false })).toBe(false);
    expect(isTrustedAppUrl('', { isPackaged: false })).toBe(false);
  });
});
