import { describe, it, expect } from 'vitest';
import { isBookmarkable } from './bookmarkable';

describe('isBookmarkable', () => {
  it('allows http(s) pages', () => {
    expect(isBookmarkable('https://x.com')).toBe(true);
    expect(isBookmarkable('http://x.com/path')).toBe(true);
    expect(isBookmarkable('  https://x.com  ')).toBe(true); // trimmed
  });

  it('allows trusted internal pages and local files (the system paths)', () => {
    expect(isBookmarkable('tepegoz://settings')).toBe(true);
    expect(isBookmarkable('tepegoz://history')).toBe(true);
    expect(isBookmarkable('file:///C:/Users/x/report.pdf')).toBe(true);
  });

  it('rejects schemes that could execute or smuggle content', () => {
    expect(isBookmarkable('javascript:alert(1)')).toBe(false);
    expect(isBookmarkable('data:text/html,<h1>x</h1>')).toBe(false);
    expect(isBookmarkable('blob:https://x.com/abc')).toBe(false);
    expect(isBookmarkable('chrome://settings')).toBe(false);
    expect(isBookmarkable('about:blank')).toBe(false);
    expect(isBookmarkable('filesystem:https://x.com/temp')).toBe(false);
    expect(isBookmarkable('')).toBe(false);
  });
});
