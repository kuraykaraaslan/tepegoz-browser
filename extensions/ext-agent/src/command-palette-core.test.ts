import { describe, expect, it } from 'vitest';
import {
  clampSelection,
  cycleMode,
  filterCommands,
  moveSelection,
  scrollToIndex,
  visibleWindow,
  type PaletteCommand,
} from './command-palette-core';

const cmd = (id: string, title: string, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({
  id,
  title,
  run: () => undefined,
  ...extra,
});

describe('filterCommands', () => {
  const commands = [
    cmd('a', 'Open new tab', { keywords: ['sekme'] }),
    cmd('b', 'Close current tab'),
    cmd('c', 'İSTANBUL Gezisi', { subtitle: 'https://a.example' }),
    cmd('d', 'Toggle reader mode'),
  ];

  it('returns everything for an empty query', () => {
    expect(filterCommands(commands, '   ')).toHaveLength(4);
  });

  it('narrows as words are added, rather than widening', () => {
    // Every token must match. OR-matching makes a palette useless the moment the list is long: typing
    // more would return more.
    expect(filterCommands(commands, 'tab')).toHaveLength(2);
    expect(filterCommands(commands, 'tab close')).toHaveLength(1);
    expect(filterCommands(commands, 'tab close nonsense')).toHaveLength(0);
  });

  it('matches out-of-order words', () => {
    expect(filterCommands(commands, 'current close')[0]?.id).toBe('b');
  });

  it('searches subtitle and keywords, not just the title', () => {
    expect(filterCommands(commands, 'a.example')[0]?.id).toBe('c');
    expect(filterCommands(commands, 'sekme')[0]?.id).toBe('a');
  });

  it('finds a dotted-İ command from a plain-i query', () => {
    // The palette shares the fold with the omnibox and the bookmarks manager, so Turkish behaves the
    // same everywhere. `'İSTANBUL'.toLowerCase().includes('istanbul')` is false.
    expect(filterCommands(commands, 'istanbul')[0]?.id).toBe('c');
  });
});

describe('cycleMode', () => {
  it('wraps forward and back', () => {
    expect(cycleMode('chat', 1)).toBe('do');
    expect(cycleMode('tasks', 1)).toBe('chat');
    expect(cycleMode('chat', -1)).toBe('tasks');
  });
});

describe('moveSelection', () => {
  it('wraps at both ends so the last item is one keypress away', () => {
    expect(moveSelection(0, -1, 5)).toBe(4);
    expect(moveSelection(4, 1, 5)).toBe(0);
    expect(moveSelection(2, 1, 5)).toBe(3);
  });

  it('never indexes into an empty list', () => {
    expect(moveSelection(3, 1, 0)).toBe(0);
  });
});

describe('clampSelection', () => {
  it('returns to the top when the list shrinks under the highlight', () => {
    // Typing re-filters on every keystroke. Left alone, the highlight sits at the old index and Enter
    // runs a command the user never looked at.
    expect(clampSelection(7, 3)).toBe(0);
    expect(clampSelection(1, 3)).toBe(1);
    expect(clampSelection(-2, 3)).toBe(0);
    expect(clampSelection(4, 0)).toBe(0);
  });
});

describe('visibleWindow', () => {
  it('renders only a slice of a long list, with the full scroll height preserved', () => {
    const w = visibleWindow(5000, 0, 320, 40, 4);
    expect(w.start).toBe(0);
    expect(w.end).toBeLessThan(30);
    expect(w.totalHeight).toBe(200000); // the scrollbar still reflects all 5000 rows
    expect(w.offsetTop).toBe(0);
  });

  it('moves the slice and the spacer together as it scrolls', () => {
    const w = visibleWindow(5000, 4000, 320, 40, 4);
    expect(w.start).toBe(96); // 4000/40 = 100, minus 4 overscan
    expect(w.offsetTop).toBe(96 * 40); // spacer keeps the rendered rows at the right offset
    expect(w.end).toBeGreaterThan(100);
  });

  it('never runs past the end of the list', () => {
    const w = visibleWindow(10, 0, 320, 40);
    expect(w.end).toBe(10);
  });

  it('is empty for an empty list', () => {
    expect(visibleWindow(0, 0, 320, 40)).toEqual({
      start: 0,
      end: 0,
      offsetTop: 0,
      totalHeight: 0,
    });
  });
});

describe('scrollToIndex', () => {
  it('scrolls up to reveal an item above the viewport', () => {
    expect(scrollToIndex(2, 400, 320, 40)).toBe(80);
  });

  it('scrolls down just enough to reveal an item below it', () => {
    expect(scrollToIndex(10, 0, 320, 40)).toBe(440 - 320);
  });

  it('does nothing when the item is already visible', () => {
    expect(scrollToIndex(2, 0, 320, 40)).toBeNull();
  });
});
