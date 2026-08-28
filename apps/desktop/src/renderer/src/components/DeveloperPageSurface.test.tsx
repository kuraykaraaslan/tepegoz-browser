// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { CHROMIUM_FLAG_ALLOWLIST } from '@tepegoz/shared-types';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { DeveloperPageSurface } from './DeveloperPageSurface';

stubJsdomLayout();

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

function stubBridge(): void {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
      updatePreferences: (patch: object) =>
        Promise.resolve({ ...DEFAULT_PREFERENCES, ...patch }),
      onPublicSettingsChanged: () => () => undefined,
    },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DeveloperPageSurface (tepegoz://developer)', () => {
  it('renders the Chromium Flags card and the raw preferences table without any dev-build gate', async () => {
    stubBridge();
    render(<DeveloperPageSurface />);

    // the flags card: one switch per allowlisted flag
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBe(CHROMIUM_FLAG_ALLOWLIST.length);
    });
    // the raw preferences editor: the search box the DataTable renders
    expect(screen.getByPlaceholderText(/Search settings keys|Settings keylerinde ara/i)).toBeTruthy();
  });
});
