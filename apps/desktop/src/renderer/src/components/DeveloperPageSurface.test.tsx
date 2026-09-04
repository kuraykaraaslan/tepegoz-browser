// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { CHROMIUM_FLAG_ALLOWLIST } from '@tepegoz/shared-types';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { DeveloperPageSurface } from './DeveloperPageSurface';

/**
 * Desktop host for `tepegoz://developer`. It owns its own bridge fetch/locale/theme and, unlike the
 * gated settings section, is always reachable. What is pinned here: the first fetch feeds the page, a
 * rejected fetch shows the retry card (and retry re-fetches), a cross-window prefs broadcast refetches,
 * and editing a flag flows back through `updatePreferences`.
 */

stubJsdomLayout();

let getPrefsResult: 'ok' | 'reject';
let settingsChangedCb: () => void = () => {};
const updatePreferences = vi.fn((patch: object) => Promise.resolve({ ...DEFAULT_PREFERENCES, ...patch }));

beforeEach(() => {
  getPrefsResult = 'ok';
  updatePreferences.mockClear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      getPreferences: () =>
        getPrefsResult === 'reject'
          ? Promise.reject(new Error('bridge unavailable'))
          : Promise.resolve({ ...DEFAULT_PREFERENCES }),
      updatePreferences,
      onPublicSettingsChanged: (cb: () => void) => {
        settingsChangedCb = cb;
        return () => undefined;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DeveloperPageSurface (tepegoz://developer)', () => {
  it('renders the Chromium Flags card and the raw preferences table without any dev-build gate', async () => {
    render(<DeveloperPageSurface />);

    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBe(CHROMIUM_FLAG_ALLOWLIST.length);
    });
    expect(screen.getByPlaceholderText(/Search settings keys|Settings keylerinde ara/i)).toBeTruthy();
  });

  it('shows the retry card when the first fetch fails, then recovers on retry', async () => {
    getPrefsResult = 'reject';
    render(<DeveloperPageSurface />);

    const retry = await screen.findByRole('button', { name: /retry|try again|tekrar/i });
    getPrefsResult = 'ok';
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBe(CHROMIUM_FLAG_ALLOWLIST.length);
    });
  });

  it('refetches preferences when another window broadcasts a change', async () => {
    render(<DeveloperPageSurface />);
    await waitFor(() => expect(screen.getAllByRole('switch').length).toBeGreaterThan(0));

    getPrefsResult = 'reject'; // the refetch rejects — last-known prefs are kept, no throw
    await act(async () => {
      settingsChangedCb();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('switch').length).toBe(CHROMIUM_FLAG_ALLOWLIST.length);
  });

  it('routes a flag edit back through updatePreferences', async () => {
    render(<DeveloperPageSurface />);
    await waitFor(() => expect(screen.getAllByRole('switch').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('switch')[0]!);
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1));
  });
});
