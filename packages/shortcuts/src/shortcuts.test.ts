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

  it('fires F12 with no modifiers and not with them, same shape as F11', () => {
    expect(shortcutFor(press({ key: 'F12' }), 'main')).toBe('devToolsF12');
    expect(shortcutFor(press({ key: 'F12', ctrlOrCmd: true }), 'main')).toBeNull();
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
    // `commandPalette` is `main` scope (the key usually arrives while a page has focus, like `find`).
    expect(shortcutFor(withCmd, 'main')).toBe('commandPalette');
    expect(shortcutFor(withCtrl, 'main')).toBe('commandPalette');
    expect(shortcutFor(withCtrl, 'renderer')).toBeNull();
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

describe('the tab-switching shortcuts', () => {
  const byId = (id: string) => ALL.find((s) => s.id === id)!;

  it('are written the way people read them', () => {
    expect(formatShortcut(byId('nextTab'), 'win32')).toBe('Ctrl+Tab');
    expect(formatShortcut(byId('prevTab'), 'win32')).toBe('Ctrl+Shift+Tab');
    expect(formatShortcut(byId('nextTabAlt'), 'win32')).toBe('Ctrl+PgDn');
    expect(formatShortcut(byId('prevTabAlt'), 'darwin')).toBe('⌘PgUp');
    expect(formatShortcut(byId('selectLastTab'), 'win32')).toBe('Ctrl+9');
  });

  it('match Electron key names case-insensitively, and only exactly', () => {
    const ctrl = { ctrlOrCmd: true, shift: false, alt: false };
    expect(shortcutFor({ key: 'Tab', ...ctrl }, 'main')).toBe('nextTab');
    expect(shortcutFor({ key: 'Tab', ...ctrl, shift: true }, 'main')).toBe('prevTab');
    expect(shortcutFor({ key: 'PageDown', ...ctrl }, 'main')).toBe('nextTabAlt');
    expect(shortcutFor({ key: 'PageUp', ...ctrl }, 'main')).toBe('prevTabAlt');
    expect(shortcutFor({ key: '9', ...ctrl }, 'main')).toBe('selectLastTab');
    expect(shortcutFor({ key: 'Tab', ...ctrl, alt: true }, 'main')).toBeNull();
    expect(
      shortcutFor({ key: 'Tab', ctrlOrCmd: false, shift: false, alt: false }, 'main'),
    ).toBeNull();
  });

  it('cover Ctrl+1 to Ctrl+8 plus "last", with no gaps', () => {
    for (let n = 1; n <= 8; n++) expect(byId(`selectTab${String(n)}`).key).toBe(String(n));
    expect(ALL.filter((s) => s.id.startsWith('selectTab')).length).toBe(8);
  });
});

describe('digit shortcuts follow the physical key', () => {
  const ctrl = { ctrlOrCmd: true, shift: false, alt: false };

  it('Ctrl+1 works on an AZERTY keyboard, where the unshifted top row types "&"', () => {
    expect(shortcutFor({ key: '&', code: 'Digit1', ...ctrl }, 'main')).toBe('selectTab1');
    expect(shortcutFor({ key: 'é', code: 'Digit2', ...ctrl }, 'main')).toBe('selectTab2');
    expect(shortcutFor({ key: 'ç', code: 'Digit9', ...ctrl }, 'main')).toBe('selectLastTab');
  });

  it('still works from the typed character when the source gives no code', () => {
    expect(shortcutFor({ key: '3', ...ctrl }, 'main')).toBe('selectTab3');
  });

  it('does not match the numpad digit (a different physical key) or the wrong row key', () => {
    expect(shortcutFor({ key: '1', code: 'Numpad1', ...ctrl }, 'main')).toBeNull();
    expect(shortcutFor({ key: '1', code: 'Digit2', ...ctrl }, 'main')).toBe('selectTab2');
  });

  it('keeps letter shortcuts on the typed character, so Dvorak users follow their layout', () => {
    expect(shortcutFor({ key: 't', code: 'KeyF', ...ctrl }, 'renderer')).toBe('newTab');
    expect(shortcutFor({ key: 'f', code: 'KeyT', ...ctrl }, 'main')).toBe('find');
  });

  it('carries the code from both input shapes', () => {
    expect(
      pressFromEvent({
        key: '&',
        code: 'Digit1',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toMatchObject({ code: 'Digit1' });
    expect(
      pressFromInput({
        key: '&',
        code: 'Digit1',
        control: true,
        meta: false,
        shift: false,
        alt: false,
      }),
    ).toMatchObject({ code: 'Digit1' });
  });
});

describe('matchesShortcut is the primitive both of those use', () => {
  it('is false when a required modifier is missing', () => {
    expect(matchesShortcut(ALL[0]!, press({ key: 't' }))).toBe(false);
  });
});
