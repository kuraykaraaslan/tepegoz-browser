// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { HistoryPageSurface } from './HistoryPageSurface';

/**
 * The standalone `tepegoz://history` document host. It threads the preload bridge straight into the
 * generic `@tepegoz/history-ui` page: an empty query lists, a non-empty one searches, and remove /
 * clear map to their bridge calls. This pins the wiring (the surface's own `list` branch) — the page's
 * own behaviour is covered in its package.
 */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  getHistory: vi.fn(() => Promise.resolve([])),
  searchHistory: vi.fn(() => Promise.resolve([])),
  deleteHistory: vi.fn(() => Promise.resolve()),
  clearHistory: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryPageSurface', () => {
  it('lists history through the bridge on first render (empty query path)', async () => {
    render(<HistoryPageSurface />);
    await waitFor(() => expect(bridge.getHistory).toHaveBeenCalled());
    expect(bridge.getHistory).toHaveBeenCalledWith({ offset: 0 });
    expect(bridge.searchHistory).not.toHaveBeenCalled();
  });

  it('routes a non-empty query to searchHistory, not getHistory', async () => {
    render(<HistoryPageSurface />);
    await waitFor(() => expect(bridge.getHistory).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'weather' } });

    await waitFor(() =>
      expect(bridge.searchHistory).toHaveBeenCalledWith({ query: 'weather', offset: 0 }),
    );
  });
});
