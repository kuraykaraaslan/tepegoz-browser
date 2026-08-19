import { describe, expect, it } from 'vitest';
import { isOriginSwap, originOf, originSwapMessage } from './origin-guard.js';

describe('isOriginSwap', () => {
  it('catches a different host — the look-alike case', () => {
    expect(isOriginSwap('https://bank.test/transfer', 'https://bank-secure.test/transfer')).toBe(true);
  });

  it('catches a different PORT, which is a different origin even on the same host', () => {
    // This is exactly what the fixture server's peer origin is, and what the trap fixtures swap to.
    expect(isOriginSwap('http://127.0.0.1:5001/a', 'http://127.0.0.1:5002/a')).toBe(true);
  });

  it('allows a different page on the same origin', () => {
    expect(isOriginSwap('https://acme.test/cart', 'https://acme.test/checkout')).toBe(false);
  });

  it('allows www ↔ apex, which is one site to every user', () => {
    expect(isOriginSwap('https://www.acme.test/a', 'https://acme.test/a')).toBe(false);
    expect(isOriginSwap('https://acme.test/a', 'https://www.acme.test/a')).toBe(false);
  });

  it('allows an http → https upgrade, and refuses the downgrade', () => {
    expect(isOriginSwap('http://acme.test/a', 'https://acme.test/a')).toBe(false);
    expect(isOriginSwap('https://acme.test/a', 'http://acme.test/a')).toBe(true);
  });

  it('does not call an unreadable URL a swap — it must be able to PROVE one to refuse', () => {
    expect(isOriginSwap('', 'https://acme.test/')).toBe(false);
    expect(isOriginSwap('https://acme.test/', '')).toBe(false);
    expect(isOriginSwap('not a url', 'also not a url')).toBe(false);
  });

  it('DOES treat leaving an internal page for the web as a swap', () => {
    // A ref located on tepegoz://newtab addresses nothing on a web page — this is a real change of
    // what the page is, not a cosmetic one, and refusing is the correct outcome.
    expect(isOriginSwap('tepegoz://newtab', 'https://acme.test/')).toBe(true);
  });

  it('ignores query and hash changes', () => {
    expect(isOriginSwap('https://acme.test/a?x=1', 'https://acme.test/a?x=2#top')).toBe(false);
  });
});

describe('originOf', () => {
  it('returns the origin, and empty for something unparseable', () => {
    expect(originOf('https://acme.test:8443/deep/path?q=1')).toBe('https://acme.test:8443');
    expect(originOf('not a url')).toBe('');
  });
});

describe('originSwapMessage', () => {
  it('names both origins and says plainly that nothing happened', () => {
    const message = originSwapMessage('https://bank.test/x', 'https://bank-secure.test/x');
    expect(message).toContain('https://bank.test');
    expect(message).toContain('https://bank-secure.test');
    expect(message).toContain('NOT performed');
  });
});
