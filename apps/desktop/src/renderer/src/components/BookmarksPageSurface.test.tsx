// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { BookmarksManager, type BookmarksManagerProps } from '@tepegoz/bookmarks-ui';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { BookmarksPageSurface } from './BookmarksPageSurface';

/**
 * Standalone `tepegoz://bookmarks` host — threads the preload bridge into `@tepegoz/bookmarks-ui`'s
 * `BookmarksManager` (its own fully-covered package). `BookmarksManager` is mocked to a capturing
 * `vi.fn(() => null)` so this file's test is scoped to ITS OWN glue: the `getTree` fetch, the
 * `onBookmarksChanged` subscription bumping `refreshKey`, and every one of the 6 callback props
 * actually reaching the right `window.tepegoz` call.
 */

vi.mock('@tepegoz/bookmarks-ui', () => ({ BookmarksManager: vi.fn(() => null) }));

stubJsdomLayout();

let bookmarksChangedCb: () => void = () => {};

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  onBookmarksChanged: vi.fn<(cb: () => void) => () => void>((cb) => {
    bookmarksChangedCb = cb;
    return vi.fn();
  }),
  getBookmarkTree: vi.fn(() => Promise.resolve([])),
  moveBookmark: vi.fn(() => Promise.resolve()),
  openPopup: vi.fn(),
  navigateTab: vi.fn(),
  showBookmarkContextMenu: vi.fn(),
  setBookmarkTags: vi.fn(() => Promise.resolve([])),
  exportBookmarks: vi.fn(() => Promise.resolve('')),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getBookmarkTree.mockResolvedValue([]);
  bridge.moveBookmark.mockResolvedValue(undefined);
  bridge.onBookmarksChanged.mockImplementation((cb) => {
    bookmarksChangedCb = cb;
    return vi.fn();
  });
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

function lastManagerProps(): BookmarksManagerProps {
  const calls = vi.mocked(BookmarksManager).mock.calls;
  return calls[calls.length - 1]![0];
}

describe('BookmarksPageSurface', () => {
  it('passes a getTree that fetches the bookmark forest, and subscribes to cross-window changes', async () => {
    render(<BookmarksPageSurface />);
    await lastManagerProps().getTree();
    expect(bridge.getBookmarkTree).toHaveBeenCalledTimes(1);
    expect(bridge.onBookmarksChanged).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from bookmark-change events on unmount', () => {
    const unsubscribe = vi.fn();
    bridge.onBookmarksChanged.mockImplementation((cb) => {
      bookmarksChangedCb = cb;
      return unsubscribe;
    });
    const view = render(<BookmarksPageSurface />);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('bumps refreshKey when a cross-window change fires', () => {
    render(<BookmarksPageSurface />);
    const before = lastManagerProps().refreshKey;
    act(() => bookmarksChangedCb());
    expect(lastManagerProps().refreshKey).toBe(before + 1);
  });

  it('moving a bookmark bumps refreshKey on success and does nothing on rejection', async () => {
    render(<BookmarksPageSurface />);
    const before = lastManagerProps().refreshKey;
    await act(async () => {
      lastManagerProps().onMove('b1', 'f1', 2);
      await Promise.resolve();
    });
    expect(bridge.moveBookmark).toHaveBeenCalledWith('b1', 'f1', 2);
    expect(lastManagerProps().refreshKey).toBe(before + 1);

    bridge.moveBookmark.mockRejectedValueOnce(new Error('locked'));
    const beforeReject = lastManagerProps().refreshKey;
    await act(async () => {
      lastManagerProps().onMove('b2', 'f1', 0);
      await Promise.resolve();
    });
    expect(lastManagerProps().refreshKey).toBe(beforeReject);
  });

  it('onNewFolder opens the add-folder dialog anchored under the toolbar', () => {
    render(<BookmarksPageSurface />);
    lastManagerProps().onNewFolder('f1');
    expect(bridge.openPopup).toHaveBeenCalledWith('bookmark-add-folder', expect.anything(), { id: 'f1' });
  });

  it('onOpen navigates the active tab', () => {
    render(<BookmarksPageSurface />);
    lastManagerProps().onOpen('https://a.example');
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://a.example');
  });

  it('onContextMenu shows the native menu for the node', () => {
    render(<BookmarksPageSurface />);
    lastManagerProps().onContextMenu('b1', 'bookmark');
    expect(bridge.showBookmarkContextMenu).toHaveBeenCalledWith('b1', 'bookmark');
  });

  it('onSetTags writes the tags through the bridge', async () => {
    render(<BookmarksPageSurface />);
    await lastManagerProps().onSetTags('b1', ['work']);
    expect(bridge.setBookmarkTags).toHaveBeenCalledWith('b1', ['work']);
  });

  it('onExport produces the Netscape HTML export', async () => {
    render(<BookmarksPageSurface />);
    await lastManagerProps().onExport?.();
    expect(bridge.exportBookmarks).toHaveBeenCalledTimes(1);
  });
});
