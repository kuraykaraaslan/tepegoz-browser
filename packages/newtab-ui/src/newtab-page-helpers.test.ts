import { describe, expect, it } from 'vitest';
import type { NewTabShortcut } from '@tepegoz/desktop-ipc';
import {
  GRID_COLUMNS,
  MAX_SHORTCUTS,
  hostOf,
  initialOf,
  nextRovingIndex,
  normalizeUrl,
} from './newtab-page-helpers';

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

describe('nextRovingIndex', () => {
  // A two-row grid of eight cells: 0..4 on top, 5..7 below.
  it('steps one cell on Arrow Left/Right, and one row on Arrow Up/Down', () => {
    expect(nextRovingIndex('ArrowRight', 0, 8)).toBe(1);
    expect(nextRovingIndex('ArrowLeft', 3, 8)).toBe(2);
    expect(nextRovingIndex('ArrowDown', 1, 8)).toBe(1 + GRID_COLUMNS);
    expect(nextRovingIndex('ArrowUp', 6, 8)).toBe(6 - GRID_COLUMNS);
  });

  it('jumps to the first / last cell on Home / End', () => {
    expect(nextRovingIndex('Home', 6, 8)).toBe(0);
    expect(nextRovingIndex('End', 2, 8)).toBe(7);
  });

  it('clamps at the edges rather than wrapping or leaving the grid', () => {
    expect(nextRovingIndex('ArrowLeft', 0, 8)).toBe(0);
    expect(nextRovingIndex('ArrowRight', 7, 8)).toBe(7);
    expect(nextRovingIndex('ArrowUp', 2, 8)).toBe(2);
    expect(nextRovingIndex('ArrowDown', 6, 8)).toBe(6); // 6 + 5 is past the last cell
  });

  it('leaves the index alone for a non-navigation key or an empty grid', () => {
    expect(nextRovingIndex('a', 3, 8)).toBe(3);
    expect(nextRovingIndex('ArrowRight', 0, 0)).toBe(0);
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
