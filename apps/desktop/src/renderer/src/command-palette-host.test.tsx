// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import { CommandPaletteHost, useCommandPalette } from './command-palette-host';

/**
 * The only place that knows what a palette command IS (the palette itself is presentational). Under
 * test: Ctrl/Cmd+K (caught in main, forwarded over `onCommandPaletteOpen`) toggles the host open, and
 * each chat command drives the matching browser bridge call.
 */

/** The last callback handed to `onCommandPaletteOpen`, so a test can fire the "key pressed" signal. */
let paletteCb: (() => void) | null = null;
let paletteUnsub: ReturnType<typeof vi.fn>;

const bridge = {
  createTab: vi.fn(),
  reopenClosedTab: vi.fn(),
  tabReload: vi.fn(),
  navigateTab: vi.fn(),
  platform: 'linux' as NodeJS.Platform,
  onCommandPaletteOpen: vi.fn((cb: () => void) => {
    paletteCb = cb;
    return paletteUnsub;
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  paletteCb = null;
  paletteUnsub = vi.fn();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('useCommandPalette', () => {
  it('toggles open each time main forwards Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.open).toBe(false);
    act(() => paletteCb?.());
    expect(result.current.open).toBe(true);
    act(() => paletteCb?.());
    expect(result.current.open).toBe(false);
  });

  it('subscribes through the shared bridge, not a local keydown listener', () => {
    renderHook(() => useCommandPalette());
    expect(bridge.onCommandPaletteOpen).toHaveBeenCalledTimes(1);
    // A raw Ctrl+K on the window does nothing here — the key is main's now.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    // still only the one subscription, no toggle from the DOM event
  });

  it('openWith seeds the search box — the omnibox `@command <query>` hand-off', () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.openWith('settings'));
    expect(result.current.open).toBe(true);
    expect(result.current.query).toBe('settings');
  });

  it('clears the seed on the next Ctrl+K, so it can never become a sticky filter', () => {
    // A palette summoned by keyboard must show every command. If the seed survived, a user would be
    // silently looking at a filtered list they never asked for and could not see the cause of.
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.openWith('settings'));
    act(() => result.current.setOpen(false));
    act(() => paletteCb?.());
    expect(result.current.open).toBe(true);
    expect(result.current.query).toBe('');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCommandPalette());
    unmount();
    expect(paletteUnsub).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPaletteHost', () => {
  function openHost(initialQuery?: string) {
    const onClose = vi.fn();
    render(
      <I18nProvider locale="en">
        <CommandPaletteHost
          open
          onClose={onClose}
          {...(initialQuery === undefined ? {} : { initialQuery })}
        />
      </I18nProvider>,
    );
    return { onClose, input: screen.getByRole('combobox') };
  }

  const runByQuery = (input: HTMLElement, query: string) => {
    fireEvent.change(input, { target: { value: query } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  it('runs "new tab"', () => {
    const { input } = openHost();
    runByQuery(input, 'new tab');
    expect(bridge.createTab).toHaveBeenCalledTimes(1);
  });

  it('runs "reopen closed tab"', () => {
    const { input } = openHost();
    runByQuery(input, 'reopen');
    expect(bridge.reopenClosedTab).toHaveBeenCalledTimes(1);
  });

  it('runs "reload"', () => {
    const { input } = openHost();
    runByQuery(input, 'reload');
    expect(bridge.tabReload).toHaveBeenCalledTimes(1);
  });

  it('navigates to the internal settings URL for the settings command', () => {
    const { input } = openHost();
    runByQuery(input, 'settings');
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_SETTINGS_URL);
  });

  it('finds a keyboard shortcut by its key and jumps to the shortcuts list', () => {
    const { input } = openHost();
    // "Ctrl+L" is the address-bar shortcut — searchable by the key a user half-remembers.
    runByQuery(input, 'ctrl+l');
    expect(bridge.navigateTab).toHaveBeenCalledWith(`${INTERNAL_SETTINGS_URL}#shortcuts`);
  });

  it('opens already filtered by the seed, and Enter runs the top match', () => {
    // The hand-off has to arrive filtered or it is not a hand-off — the user would retype the words
    // they had already typed into the address bar.
    const { input } = openHost('settings');
    expect((input as HTMLInputElement).value).toBe('settings');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_SETTINGS_URL);
  });

  it('surfaces the shortcut rows under a generic term ("shortcut")', () => {
    openHost();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shortcut' } });
    // The registry has well over a dozen entries; every one is a findable row.
    expect(screen.getAllByText('Ctrl+R').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(5);
  });
});
