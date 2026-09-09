import { describe, expect, it } from 'vitest';
import type { NewTabShortcut } from '@tepegoz/desktop-ipc';
import { MAX_SHORTCUTS, hostOf, initialOf, normalizeUrl } from './newtab-page-helpers';

const shortcut = (over: Partial<NewTabShortcut> = {}): NewTabShortcut => ({
  id: 's1',
  title: 'Example',
  url: 'https://www.example.com/path',
  ...over,
});

describe('MAX_SHORTCUTS', () => {
  it('is the two-row Chrome-style grid size', () => {
    expect(MAX_SHORTCUTS).toBe(10);
  });
});

describe('hostOf', () => {
  it('returns the hostname without a leading www.', () => {
    expect(hostOf('https://www.example.com/x?y=1')).toBe('example.com');
    expect(hostOf('http://sub.example.co.uk')).toBe('sub.example.co.uk');
  });

  it('falls back to the raw input when the URL will not parse', () => {
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('initialOf', () => {
  it('uses the first letter of the title, uppercased', () => {
    expect(initialOf(shortcut({ title: 'reddit' }))).toBe('R');
  });

  it('falls back to the host when the title is blank', () => {
    expect(initialOf(shortcut({ title: '   ', url: 'https://news.ycombinator.com' }))).toBe('N');
  });

  it('is "?" when there is neither a title nor a parseable host', () => {
    expect(initialOf(shortcut({ title: '', url: '' }))).toBe('?');
  });
});

describe('normalizeUrl', () => {
  it('prepends https:// to a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com');
  });

  it('leaves an already-schemed URL (or tepegoz://) untouched', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('ftp://example.com')).toBe('ftp://example.com');
    expect(normalizeUrl('tepegoz://settings')).toBe('tepegoz://settings');
  });

  it('returns "" for empty / whitespace input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });
});
