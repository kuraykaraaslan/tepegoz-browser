// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useOmniboxFocusShortcut } from './app-omnibox-focus';

/**
 * Ctrl+L / Alt+D focuses the omnibox. Main catches the key and sends `omnibox:focus`; this hook turns
 * each one into an incrementing token (a counter, not a boolean, so pressing the shortcut twice in a
 * row focuses twice). Starts at 0 so nothing steals focus on mount, and it unsubscribes on unmount.
 */

let fire: () => void = () => {};
const unsubscribe = vi.fn();
const onOmniboxFocus = vi.fn((cb: () => void) => {
  fire = cb;
  return unsubscribe;
});

beforeEach(() => {
  unsubscribe.mockClear();
  onOmniboxFocus.mockClear();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { onOmniboxFocus } });
});
afterEach(cleanup);

describe('useOmniboxFocusShortcut', () => {
  it('starts at 0 so nothing is focused on mount', () => {
    const { result } = renderHook(() => useOmniboxFocusShortcut());
    expect(result.current).toBe(0);
    expect(onOmniboxFocus).toHaveBeenCalledTimes(1);
  });

  it('increments once per omnibox:focus event', () => {
    const { result } = renderHook(() => useOmniboxFocusShortcut());
    act(() => {
      fire();
    });
    expect(result.current).toBe(1);
    act(() => {
      fire();
    });
    expect(result.current).toBe(2);
  });

  it('unsubscribes from the main-process channel on unmount', () => {
    const { unmount } = renderHook(() => useOmniboxFocusShortcut());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
