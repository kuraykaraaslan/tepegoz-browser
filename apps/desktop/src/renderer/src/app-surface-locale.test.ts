// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useSurfaceLocale } from './app-surface-locale';

/**
 * The locale + theme bootstrap every standalone `tepegoz://` surface uses (settings, downloads,
 * process, …). It fetches prefs once, applies the theme immediately (no flash), resolves the locale,
 * and re-runs on `onPublicSettingsChanged` so a theme/locale change in another window follows here.
 */

const applyTheme = vi.fn();
vi.mock('./lib/theme', () => ({
  applyTheme: (...a: unknown[]) => {
    applyTheme(...a);
  },
}));

let prefs: { theme: string; themeColor: string; locale: string };
let notify: (() => void) | null;
let unsub: ReturnType<typeof vi.fn>;

beforeEach(() => {
  prefs = { theme: 'dark', themeColor: '#123456', locale: 'tr' };
  notify = null;
  unsub = vi.fn();
  applyTheme.mockClear();
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      getPreferences: () => Promise.resolve(prefs),
      onPublicSettingsChanged: (cb: () => void) => {
        notify = cb;
        return unsub;
      },
    },
  });
});
afterEach(cleanup);

describe('useSurfaceLocale', () => {
  it('starts at en, then resolves the stored locale and applies the theme once prefs load', async () => {
    const { result } = renderHook(() => useSurfaceLocale());
    expect(result.current).toBe('en');
    await waitFor(() => expect(result.current).toBe('tr'));
    expect(applyTheme).toHaveBeenCalledWith('dark', '#123456');
  });

  it('re-applies when another window signals a settings change', async () => {
    const { result } = renderHook(() => useSurfaceLocale());
    await waitFor(() => expect(result.current).toBe('tr'));
    prefs = { theme: 'light', themeColor: '', locale: 'en' };
    await act(async () => {
      notify?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBe('en'));
    expect(applyTheme).toHaveBeenLastCalledWith('light', '');
  });

  it('unsubscribes from the settings signal on unmount', () => {
    const { unmount } = renderHook(() => useSurfaceLocale());
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('a rejected getPreferences leaves the locale at its en default', async () => {
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getPreferences: () => Promise.reject(new Error('bridge down')),
        onPublicSettingsChanged: () => vi.fn(),
      },
    });
    const { result } = renderHook(() => useSurfaceLocale());
    await Promise.resolve();
    expect(result.current).toBe('en');
    expect(applyTheme).not.toHaveBeenCalled();
  });
});
