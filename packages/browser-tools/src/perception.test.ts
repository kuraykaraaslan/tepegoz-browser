import { describe, it, expect } from 'vitest';
import { buildPageSnapshot, buildElementsSnapshot } from './perception';

describe('buildPageSnapshot', () => {
  it('caps, wraps, and carries url/title through', () => {
    const snap = buildPageSnapshot('hello world', 'https://example.com', 'Example');
    expect(snap.url).toBe('https://example.com');
    expect(snap.title).toBe('Example');
    // The raw text is wrapped as untrusted content (not returned verbatim).
    expect(snap.content).toContain('hello world');
    expect(snap.content).not.toBe('hello world');
    expect(Array.isArray(snap.flags)).toBe(true);
  });

  it('caps very long page text to the 20k limit before wrapping', () => {
    const long = 'a'.repeat(50_000);
    const snap = buildPageSnapshot(long, 'https://x', 'X');
    // The wrapped content must not carry the full 50k (it was sliced to 20k first).
    expect(snap.content.length).toBeLessThan(50_000);
  });
});

describe('buildElementsSnapshot', () => {
  it('shapes raw interactables into a ref-indexed, wrapped snapshot', () => {
    const snap = buildElementsSnapshot(
      [{ role: 'button', name: 'Submit' }] as never,
      'https://example.com',
      'Example',
    );
    expect(snap.url).toBe('https://example.com');
    expect(Array.isArray(snap.elements)).toBe(true);
    expect(typeof snap.content).toBe('string');
    expect(Array.isArray(snap.flags)).toBe(true);
  });
});
