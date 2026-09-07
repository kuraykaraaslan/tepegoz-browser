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

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCommandPalette());
    unmount();
    expect(paletteUnsub).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPaletteHost', () => {
  function openHost() {
    const onClose = vi.fn();
    render(
      <I18nProvider locale="en">
        <CommandPaletteHost open onClose={onClose} />
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
});
