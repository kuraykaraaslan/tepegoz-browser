import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, Input, WebContents } from 'electron';

/**
 * The three page keys the right-click menu had always ADVERTISED and nothing bound.
 *
 * `printActive` / `saveActive` / `viewSourceActive` existed and worked the whole time — by right-click
 * only. `@tepegoz/shortcuts` had no entry for Ctrl+P, Ctrl+S or Ctrl+U, so the menu printed a key next
 * to each row and pressing it did nothing at all. `packages/page-context-menu/src/accelerators.test.tsx`
 * locks the other half (the menu cannot advertise an unbound key); this locks the dispatch.
 *
 * Also covers the part that is easy to get wrong when adding a key: `matchesShortcut` is EXACT, so
 * Ctrl+Shift+P must NOT print. A handler that tested only the modifiers it wants would fire on every
 * superset of them.
 */

vi.mock('electron', () => ({}));
vi.mock('./window', () => ({ exitKioskWindow: vi.fn(), toggleFullScreen: vi.fn() }));
vi.mock('./onboarding.electron', () => ({ loadBrowser: vi.fn() }));

const commands = vi.hoisted(() => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
}));
vi.mock('./page-commands', () => commands);

const { handleWindowShortcut } = await import('./keyboard-shortcuts');

/** A `before-input-event` Input with every modifier explicit — the shape the matcher reduces. */
function press(key: string, mods: Partial<Omit<Input, 'type' | 'key'>> = {}): Input {
  return {
    type: 'keyDown',
    key,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...mods,
  } as Input;
}

const win = {} as BrowserWindow;
const page = {} as WebContents;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('page-command shortcuts', () => {
  const cases = [
    ['p', 'printPage'],
    ['s', 'savePage'],
    ['u', 'viewSourcePage'],
  ] as const;

  for (const [key, command] of cases) {
    it(`Ctrl+${key.toUpperCase()} runs ${command} on the page the key was pressed on`, () => {
      expect(handleWindowShortcut(win, press(key, { control: true }), page)).toBe(true);
      expect(commands[command]).toHaveBeenCalledWith(page);
    });

    it(`Cmd+${key.toUpperCase()} does the same, so macOS is not left out`, () => {
      expect(handleWindowShortcut(win, press(key, { meta: true }), page)).toBe(true);
      expect(commands[command]).toHaveBeenCalledWith(page);
    });

    it(`Ctrl+Shift+${key.toUpperCase()} does NOT run ${command} — matching is exact`, () => {
      expect(handleWindowShortcut(win, press(key, { control: true, shift: true }), page)).toBe(
        false,
      );
      expect(commands[command]).not.toHaveBeenCalled();
    });

    it(`a bare ${key.toUpperCase()} typed into the page is not a shortcut`, () => {
      expect(handleWindowShortcut(win, press(key), page)).toBe(false);
      expect(commands[command]).not.toHaveBeenCalled();
    });
  }

  it('reports NOT handled when there is no page, so the key is left alone rather than swallowed', () => {
    expect(handleWindowShortcut(win, press('p', { control: true }), null)).toBe(false);
    expect(commands.printPage).not.toHaveBeenCalled();
  });

  it('ignores keyUp — a shortcut fires once, on the way down', () => {
    const up: Input = { ...press('p', { control: true }), type: 'keyUp' };
    expect(handleWindowShortcut(win, up, page)).toBe(false);
    expect(commands.printPage).not.toHaveBeenCalled();
  });
});
