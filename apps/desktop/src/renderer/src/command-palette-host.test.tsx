// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import { CommandPaletteHost, useCommandPalette } from './command-palette-host';

/**
 * The only place that knows what a palette command IS (the palette itself is presentational). Under
 * test: Ctrl/Cmd+K toggles the host open through the shared shortcut registry (not a second local
 * binding), and each chat command drives the matching browser bridge call.
 */

const bridge = {
  createTab: vi.fn(),
  reopenClosedTab: vi.fn(),
  tabReload: vi.fn(),
  navigateTab: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('useCommandPalette', () => {
  it('toggles open on Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.open).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(result.current.open).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(result.current.open).toBe(false);
  });

  it('ignores keys that are not the palette shortcut', () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    });
    expect(result.current.open).toBe(false);
  });

  it('removes the key listener on unmount', () => {
    const { unmount, result } = renderHook(() => useCommandPalette());
    unmount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(result.current.open).toBe(false);
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
