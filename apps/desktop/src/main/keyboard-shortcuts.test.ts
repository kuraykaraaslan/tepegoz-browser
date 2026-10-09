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
const win2 = vi.hoisted(() => ({
  exitKioskWindow: vi.fn(),
  toggleFullScreen: vi.fn(),
  loadBrowser: vi.fn(),
}));
vi.mock('./window', () => ({
  exitKioskWindow: win2.exitKioskWindow,
  toggleFullScreen: win2.toggleFullScreen,
}));
vi.mock('./onboarding.electron', () => ({ loadBrowser: win2.loadBrowser }));

const commands = vi.hoisted(() => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
  reloadPage: vi.fn(),
  toggleDevToolsGated: vi.fn(),
}));
vi.mock('./page-commands', () => commands);

const { handleWindowShortcut, handleWindowKeyUp } = await import('./keyboard-shortcuts');

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

const sent: string[] = [];
let kiosk = false;
const win = {
  webContents: { send: (channel: string) => sent.push(channel) },
  isKiosk: () => kiosk,
} as unknown as BrowserWindow;
const page = {} as WebContents;

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  kiosk = false;
});

describe('page-command shortcuts', () => {
  const cases = [
    ['p', 'printPage'],
    ['s', 'savePage'],
    ['u', 'viewSourcePage'],
  ] as const;

  for (const [key, command] of cases) {
    it(`Ctrl+${key.toUpperCase()} runs ${command} on the page the key was pressed on`, () => {
      expect(handleWindowShortcut(win, press(key, { control: true }), { page })).toBe(true);
      expect(commands[command]).toHaveBeenCalledWith(page);
    });

    it(`Cmd+${key.toUpperCase()} does the same, so macOS is not left out`, () => {
      expect(handleWindowShortcut(win, press(key, { meta: true }), { page })).toBe(true);
      expect(commands[command]).toHaveBeenCalledWith(page);
    });

    it(`Ctrl+Shift+${key.toUpperCase()} does NOT run ${command} — matching is exact`, () => {
      expect(handleWindowShortcut(win, press(key, { control: true, shift: true }), { page })).toBe(
        false,
      );
      expect(commands[command]).not.toHaveBeenCalled();
    });

    it(`a bare ${key.toUpperCase()} typed into the page is not a shortcut`, () => {
      expect(handleWindowShortcut(win, press(key), { page })).toBe(false);
      expect(commands[command]).not.toHaveBeenCalled();
    });
  }

  it('reports NOT handled when there is no page, so the key is left alone rather than swallowed', () => {
    expect(handleWindowShortcut(win, press('p', { control: true }), { page: null })).toBe(false);
    expect(commands.printPage).not.toHaveBeenCalled();
  });

  it('ignores keyUp — a shortcut fires once, on the way down', () => {
    const up: Input = { ...press('p', { control: true }), type: 'keyUp' };
    expect(handleWindowShortcut(win, up, { page })).toBe(false);
    expect(commands.printPage).not.toHaveBeenCalled();
  });

  it('Ctrl+W closes the TAB, not the window — the default menu closed the window', () => {
    const closeActiveTab = vi.fn();
    expect(handleWindowShortcut(win, press('w', { control: true }), { page, closeActiveTab })).toBe(
      true,
    );
    expect(closeActiveTab).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+R reloads, and Ctrl+Shift+R reloads hard — two different keys, not one', () => {
    handleWindowShortcut(win, press('r', { control: true }), { page });
    expect(commands.reloadPage).toHaveBeenLastCalledWith(page);
    handleWindowShortcut(win, press('r', { control: true, shift: true }), { page });
    expect(commands.reloadPage).toHaveBeenLastCalledWith(page, true);
  });

  it('prefers the reloadActiveTab target (routes through the tab model, so tepegoz:// pages reload)', () => {
    const reloadActiveTab = vi.fn();
    expect(
      handleWindowShortcut(win, press('r', { control: true }), { page, reloadActiveTab }),
    ).toBe(true);
    expect(reloadActiveTab).toHaveBeenLastCalledWith(false);
    handleWindowShortcut(win, press('r', { control: true, shift: true }), {
      page,
      reloadActiveTab,
    });
    expect(reloadActiveTab).toHaveBeenLastCalledWith(true);
    expect(commands.reloadPage).not.toHaveBeenCalled();
  });

  /**
   * The security property. Ctrl+Shift+I must reach the GATED toggle, never Electron's ungated
   * `toggleDevTools` role — which is what answered this key for as long as the app never set its own
   * application menu. `page-commands.test.ts` covers the gate's own verdict; this covers the routing.
   */
  it('Ctrl+Shift+I routes to the gated DevTools toggle', () => {
    expect(handleWindowShortcut(win, press('i', { control: true, shift: true }), { page })).toBe(
      true,
    );
    expect(commands.toggleDevToolsGated).toHaveBeenCalledWith(page);
  });

  /**
   * F12 is the second key for the same action (see `focusAddressBar`/`focusAddressBarAlt` for the
   * pattern), so it must reach the exact same gated call as Ctrl+Shift+I — never a parallel path.
   */
  it('F12 (no modifiers) routes to the same gated DevTools toggle', () => {
    expect(handleWindowShortcut(win, press('F12'), { page })).toBe(true);
    expect(commands.toggleDevToolsGated).toHaveBeenCalledWith(page);
  });

  it('Ctrl+F12 does NOT toggle DevTools — F12 is bound bare, like F11', () => {
    expect(handleWindowShortcut(win, press('F12', { control: true }), { page })).toBe(false);
    expect(commands.toggleDevToolsGated).not.toHaveBeenCalled();
  });
});

describe('the window-level shortcuts', () => {
  it('F11 toggles fullscreen', () => {
    expect(handleWindowShortcut(win, press('F11'), { page })).toBe(true);
    expect(win2.toggleFullScreen).toHaveBeenCalledWith(win);
  });

  it('Ctrl+F asks the chrome to open its find bar (page has focus, chrome never sees the key)', () => {
    expect(handleWindowShortcut(win, press('f', { control: true }), { page })).toBe(true);
    expect(sent).toEqual(['find:open']);
  });

  it('Ctrl+L asks the chrome to focus the address bar (omnibox track A7)', () => {
    // There was no keyboard path to the address bar at all — 15 shortcuts, none of them this one,
    // which is a WCAG 2.1.1 failure on the control a browser is used through.
    expect(handleWindowShortcut(win, press('l', { control: true }), { page })).toBe(true);
    expect(sent).toEqual(['omnibox:focus']);
  });

  it('Alt+D does the same, because both are muscle memory', () => {
    expect(handleWindowShortcut(win, press('d', { alt: true }), { page })).toBe(true);
    expect(sent).toEqual(['omnibox:focus']);
  });

  it('Ctrl+Alt+D is NOT the address bar — AltGr on a Turkish keyboard types with it', () => {
    expect(handleWindowShortcut(win, press('d', { control: true, alt: true }), { page })).toBe(
      false,
    );
    expect(sent).toEqual([]);
  });

  it('Ctrl+Shift+N opens a private window through the injected target', () => {
    const openPrivateWindow = vi.fn();
    expect(
      handleWindowShortcut(win, press('n', { control: true, shift: true }), {
        page,
        openPrivateWindow,
      }),
    ).toBe(true);
    expect(openPrivateWindow).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Q leaves kiosk (un-kiosk + reload the normal chrome), but only when in kiosk', () => {
    expect(handleWindowShortcut(win, press('q', { control: true, shift: true }), { page })).toBe(
      false,
    );
    expect(win2.exitKioskWindow).not.toHaveBeenCalled();

    kiosk = true;
    expect(handleWindowShortcut(win, press('q', { control: true, shift: true }), { page })).toBe(
      true,
    );
    expect(win2.exitKioskWindow).toHaveBeenCalledWith(win);
    expect(win2.loadBrowser).toHaveBeenCalledWith(win);
  });

  it.each([
    ['Tab', { control: true }, 1, 'tab'],
    ['PageDown', { control: true }, 1, 'page'],
    ['Tab', { control: true, shift: true }, -1, 'tab'],
    ['PageUp', { control: true }, -1, 'page'],
    ['Tab', { meta: true }, 1, 'tab'],
  ] as const)('%s with %j steps the tab by %i (via %s)', (key, mods, delta, via) => {
    const activateAdjacentTab = vi.fn();
    expect(handleWindowShortcut(win, press(key, mods), { page, activateAdjacentTab })).toBe(true);
    // Only the Tab key follows the "recent" preference; PageUp/PageDown stay on the strip.
    expect(activateAdjacentTab).toHaveBeenCalledWith(delta, via);
  });

  it.each(['Control', 'Meta'])(
    'releasing %s ends a recent-order walk, without consuming the key',
    (key) => {
      const endTabCycle = vi.fn();
      const up: Input = { ...press(key), type: 'keyUp' };
      handleWindowKeyUp(up, { page, endTabCycle });
      expect(endTabCycle).toHaveBeenCalledTimes(1);
    },
  );

  it('does not end the walk for another key, a key-down, or when no tab model is wired', () => {
    const endTabCycle = vi.fn();
    handleWindowKeyUp({ ...press('Shift'), type: 'keyUp' }, { page, endTabCycle });
    handleWindowKeyUp(press('Control'), { page, endTabCycle }); // keyDown
    expect(endTabCycle).not.toHaveBeenCalled();
    expect(() => handleWindowKeyUp({ ...press('Control'), type: 'keyUp' }, { page })).not.toThrow();
  });

  it('Ctrl+1…8 select that tab and Ctrl+9 selects the LAST one', () => {
    const activateTabAtPosition = vi.fn();
    for (const n of [1, 4, 8]) {
      handleWindowShortcut(win, press(String(n), { control: true }), {
        page,
        activateTabAtPosition,
      });
    }
    handleWindowShortcut(win, press('9', { control: true }), { page, activateTabAtPosition });
    expect(activateTabAtPosition.mock.calls).toEqual([[1], [4], [8], ['last']]);
  });

  it('does not treat Ctrl+Alt+Tab, Ctrl+Alt+1 or a bare Tab/1 as a tab switch', () => {
    const activateAdjacentTab = vi.fn();
    const activateTabAtPosition = vi.fn();
    const targets = { page, activateAdjacentTab, activateTabAtPosition };
    expect(handleWindowShortcut(win, press('Tab', { control: true, alt: true }), targets)).toBe(
      false,
    );
    expect(handleWindowShortcut(win, press('1', { control: true, alt: true }), targets)).toBe(
      false,
    );
    expect(handleWindowShortcut(win, press('Tab'), targets)).toBe(false);
    expect(handleWindowShortcut(win, press('1'), targets)).toBe(false);
    expect(activateAdjacentTab).not.toHaveBeenCalled();
    expect(activateTabAtPosition).not.toHaveBeenCalled();
  });

  it('leaves the keys unhandled when the caller wired no tab model', () => {
    expect(handleWindowShortcut(win, press('Tab', { control: true }), { page })).toBe(false);
    expect(handleWindowShortcut(win, press('3', { control: true }), { page })).toBe(false);
  });

  it('Ctrl+W is NOT handled when the caller wired no closeActiveTab', () => {
    expect(handleWindowShortcut(win, press('w', { control: true }), { page })).toBe(false);
  });

  it('Ctrl+K asks the chrome to toggle the command palette (page has focus, chrome never sees the key)', () => {
    expect(handleWindowShortcut(win, press('k', { control: true }), { page })).toBe(true);
    expect(sent).toEqual(['command-palette:open']);
  });

  it('Cmd+K does the same, so macOS is not left out', () => {
    expect(handleWindowShortcut(win, press('k', { meta: true }), { page })).toBe(true);
    expect(sent).toEqual(['command-palette:open']);
  });

  it('an unrecognised combination is left for the page', () => {
    expect(handleWindowShortcut(win, press('j', { control: true }), { page })).toBe(false);
  });

  it('reload / hard-reload / view-source / devtools report NOT handled with no page', () => {
    for (const p of [
      press('r', { control: true }),
      press('r', { control: true, shift: true }),
      press('u', { control: true }),
      press('i', { control: true, shift: true }),
      press('F12'),
    ]) {
      expect(handleWindowShortcut(win, p, { page: null })).toBe(false);
    }
  });
});
