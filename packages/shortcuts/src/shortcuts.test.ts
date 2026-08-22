import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  matchesShortcut,
  pressFromEvent,
  pressFromInput,
  SHORTCUTS,
  shortcutFor,
  type KeyPress,
  type ShortcutSpec,
} from './shortcuts';

/** `SHORTCUTS` is `as const`, so each element narrows to its own literal type and the optional
 *  modifiers vanish from the union. Widen once here — the registry's literal-ness exists for
 *  `ShortcutId`, not for iterating. */
const ALL: readonly ShortcutSpec[] = SHORTCUTS;

const press = (over: Partial<KeyPress> & { key: string }): KeyPress => ({
  ctrlOrCmd: false,
  shift: false,
  alt: false,
  ...over,
});

describe('the registry is internally consistent', () => {
  it('has no two shortcuts on the same combination in the same scope', () => {
    // The thing three separate listener files could not check. Two handlers on one combination both
    // fire, in mount order, and which one wins is an accident of module loading.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const s of ALL) {
      const key = `${s.scope}|${s.key}|${String(s.ctrlOrCmd ?? false)}|${String(s.shift ?? false)}|${String(s.alt ?? false)}`;
      const prior = seen.get(key);
      if (prior !== undefined) clashes.push(`${prior} vs ${s.id}`);
      seen.set(key, s.id);
    }
    expect(clashes).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
  });

  it('spells every key lowercase, so matching never depends on how it was typed here', () => {
    expect(ALL.filter((s) => s.key !== s.key.toLowerCase())).toEqual([]);
  });
});

describe('matching is exact, not "at least"', () => {
  it('does not fire Ctrl+T for Ctrl+Shift+T', () => {
    // A handler that checks only the modifiers it wants fires on every superset of them. That is how
    // "reopen closed tab" also opened a new tab.
    expect(shortcutFor(press({ key: 't', ctrlOrCmd: true, shift: true }), 'renderer')).toBe(
      'reopenClosedTab',
    );
    expect(shortcutFor(press({ key: 't', ctrlOrCmd: true }), 'renderer')).toBe('newTab');
  });

  it('does NOT fire on Ctrl+Alt+T', () => {
    // Ctrl+Alt+T is a terminal on Linux, and AltGr combinations matter on a Turkish-Q keyboard, where
    // @ # $ € ₺ are all AltGr. A shortcut that ignores Alt steals them.
    expect(shortcutFor(press({ key: 't', ctrlOrCmd: true, alt: true }), 'renderer')).toBeNull();
  });

  it('does not fire a bare key when a modifier is required', () => {
    expect(shortcutFor(press({ key: 't' }), 'renderer')).toBeNull();
  });

  it('fires F11 with no modifiers and not with them', () => {
    expect(shortcutFor(press({ key: 'F11' }), 'main')).toBe('fullScreen');
    expect(shortcutFor(press({ key: 'F11', ctrlOrCmd: true }), 'main')).toBeNull();
  });

  it('keeps the scopes apart', () => {
    // Ctrl+F is handled in MAIN because the key usually arrives while the page has focus. The renderer
    // asking for it must get nothing rather than a second handler for the same press.
    expect(shortcutFor(press({ key: 'f', ctrlOrCmd: true }), 'main')).toBe('find');
    expect(shortcutFor(press({ key: 'f', ctrlOrCmd: true }), 'renderer')).toBeNull();
  });
});

describe('both input shapes reduce to the same press', () => {
  it('treats Cmd on macOS exactly like Ctrl elsewhere', () => {
    const withCmd = pressFromEvent({
      key: 'k',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    });
    const withCtrl = pressFromEvent({
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });
    expect(shortcutFor(withCmd, 'renderer')).toBe('commandPalette');
    expect(shortcutFor(withCtrl, 'renderer')).toBe('commandPalette');
  });

  it('reduces an Electron Input the same way', () => {
    const input = pressFromInput({
      key: 'F',
      control: true,
      meta: false,
      shift: false,
      alt: false,
    });
    expect(shortcutFor(input, 'main')).toBe('find');
  });
});

describe('a shortcut can be shown to a person', () => {
  it('writes macOS glyphs without separators', () => {
    const reopen = ALL.find((s) => s.id === 'reopenClosedTab');
    expect(reopen && formatShortcut(reopen, 'darwin')).toBe('⌘⇧T');
  });

  it('writes words joined with + everywhere else', () => {
    const reopen = ALL.find((s) => s.id === 'reopenClosedTab');
    expect(reopen && formatShortcut(reopen, 'win32')).toBe('Ctrl+Shift+T');
  });

  it('does not mangle a function key', () => {
    const full = ALL.find((s) => s.id === 'fullScreen');
    expect(full && formatShortcut(full, 'win32')).toBe('F11');
  });
});

describe('matchesShortcut is the primitive both of those use', () => {
  it('is false when a required modifier is missing', () => {
    expect(matchesShortcut(ALL[0]!, press({ key: 't' }))).toBe(false);
  });
});
