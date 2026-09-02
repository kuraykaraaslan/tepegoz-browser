// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { BookmarksPageSurface } from './BookmarksPageSurface';

/**
 * Standalone `tepegoz://bookmarks` host — threads the preload bridge into `@tepegoz/bookmarks-ui`.
 * `refreshKey` is bumped on `onBookmarksChanged` (any window mutating bookmarks) so the tree refetches;
 * the subscription is torn down on unmount.
 */

stubJsdomLayout();

let bookmarksChangedCb: () => void = () => {};
const unsubscribe = vi.fn();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  onBookmarksChanged: vi.fn((cb: () => void) => {
    bookmarksChangedCb = cb;
    return unsubscribe;
  }),
  getBookmarkTree: vi.fn(() => Promise.resolve([])),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookmarksPageSurface', () => {
  it('fetches the tree and subscribes to cross-window bookmark changes', async () => {
    render(<BookmarksPageSurface />);
    await waitFor(() => expect(bridge.getBookmarkTree).toHaveBeenCalled());
    expect(bridge.onBookmarksChanged).toHaveBeenCalled();
  });

  it('unsubscribes from bookmark-change events on unmount', async () => {
    const view = render(<BookmarksPageSurface />);
    await waitFor(() => expect(bridge.onBookmarksChanged).toHaveBeenCalled());
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a cross-window change fires', async () => {
    render(<BookmarksPageSurface />);
    await waitFor(() => expect(bridge.onBookmarksChanged).toHaveBeenCalled());
    expect(() => act(() => bookmarksChangedCb())).not.toThrow();
  });
});
