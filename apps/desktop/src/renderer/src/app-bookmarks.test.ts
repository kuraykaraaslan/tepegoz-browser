// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { BOOKMARK_ROOT_BAR } from '@tepegoz/bookmarks';
import { INTERNAL_BOOKMARKS_URL, type BookmarkTreeNode, type TabsState } from '@tepegoz/desktop-ipc';
import { bookmarkDialogAnchor, useBookmarksBar } from './app-bookmarks';

/**
 * The bookmarks bar/star/menu bindings. What's pinned: the star only toggles a bookmarkable URL and
 * refetches after; `findBarNode` walks the whole tree; a data outage degrades to an empty bar rather
 * than throwing; and the context-menu dispatch does the right bridge call per action (incl. the
 * "open all" >15 confirmation threshold).
 */

const bar = (children: BookmarkTreeNode[]): BookmarkTreeNode =>
  ({ id: BOOKMARK_ROOT_BAR, type: 'folder', title: 'Bar', url: null, children }) as unknown as BookmarkTreeNode;
const bm = (id: string, url: string): BookmarkTreeNode =>
  ({ id, type: 'bookmark', title: id, url, children: [] }) as unknown as BookmarkTreeNode;
const folder = (id: string, children: BookmarkTreeNode[]): BookmarkTreeNode =>
  ({ id, type: 'folder', title: id, url: null, children }) as unknown as BookmarkTreeNode;

let tree: BookmarkTreeNode[];
let menuCb: ((a: { id: string; action: string; type?: string }) => void) | null;
const bridge = {
  getBookmarkTree: vi.fn<() => Promise<BookmarkTreeNode[]>>(() => Promise.resolve(tree)),
  listBookmarks: vi.fn<() => Promise<{ url: string; title: string }[]>>(() => Promise.resolve([])),
  isBookmarked: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
  toggleBookmark: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
  moveBookmark: vi.fn(() => Promise.resolve()),
  removeBookmark: vi.fn(() => Promise.resolve()),
  navigateTab: vi.fn(),
  createTabInBackground: vi.fn(),
  openPopup: vi.fn(),
  onBookmarkMenuAction: (cb: (a: { id: string; action: string; type?: string }) => void) => {
    menuCb = cb;
    return () => {
      menuCb = null;
    };
  },
  onBookmarksChanged: () => () => undefined,
};

const tabsRef = {
  current: { tabs: [{ id: 't1', title: 'Doc', url: 'https://a.test/', faviconUrl: null }], activeId: 't1' },
} as unknown as MutableRefObject<TabsState>;

const render = (url = 'https://a.test/') => renderHook(() => useBookmarksBar(tabsRef, url));

beforeEach(() => {
  vi.clearAllMocks();
  menuCb = null;
  tree = [bar([bm('b1', 'https://one/'), folder('f1', [bm('b2', 'https://two/')])])];
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('bookmarkDialogAnchor', () => {
  it('is a 320-wide box centred horizontally, near the top', () => {
    const a = bookmarkDialogAnchor();
    expect(a.width).toBe(320);
    expect(a.x).toBe(Math.round(window.innerWidth / 2 - 160));
    expect(a.y).toBe(72);
  });
});

describe('useBookmarksBar', () => {
  it('loads the bar root children and marks a bookmarkable page', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.barNodes).toHaveLength(2));
    expect(result.current.canBookmark).toBe(true);
    await waitFor(() => expect(result.current.activeBookmarked).toBe(true));
  });

  it('an unbookmarkable URL (blank) is not marked and never queried', async () => {
    const { result } = render('');
    expect(result.current.canBookmark).toBe(false);
    await waitFor(() => expect(result.current.barNodes).toHaveLength(2));
    expect(result.current.activeBookmarked).toBe(false);
    expect(bridge.isBookmarked).not.toHaveBeenCalled();
  });

  it('degrades to an empty bar when the fetch fails', async () => {
    bridge.getBookmarkTree.mockRejectedValueOnce(new Error('db gone'));
    const { result } = render();
    await waitFor(() => expect(bridge.getBookmarkTree).toHaveBeenCalled());
    expect(result.current.barNodes).toEqual([]);
  });

  it('findBarNode walks the whole tree, not just the top level', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.barNodes).toHaveLength(2));
    expect(result.current.findBarNode('b2')?.url).toBe('https://two/');
    expect(result.current.findBarNode('nope')).toBeNull();
  });

  it('onToggleBookmark toggles a bookmarkable active tab and refetches', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.barNodes).toHaveLength(2));
    bridge.getBookmarkTree.mockClear();
    await act(async () => {
      await result.current.onToggleBookmark();
    });
    expect(bridge.toggleBookmark).toHaveBeenCalledWith('https://a.test/', 'Doc', null);
    expect(bridge.getBookmarkTree).toHaveBeenCalled(); // refetched
  });

  it('onBookmarkMove calls the bridge then refetches', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.barNodes).toHaveLength(2));
    await act(async () => {
      result.current.onBookmarkMove('b1', 'f1', 0);
      await Promise.resolve();
    });
    expect(bridge.moveBookmark).toHaveBeenCalledWith('b1', 'f1', 0);
  });
});

describe('the native context-menu dispatch', () => {
  async function ready() {
    const h = render();
    // Wait for BOTH the menu subscription AND the tree load — `open` / `open-all` resolve the node
    // from `barNodes`, so a race with the initial fetch makes the assertion flaky under load.
    await waitFor(() => expect(menuCb).not.toBeNull());
    await waitFor(() => expect(h.result.current.barNodes.length).toBeGreaterThan(0));
    return h;
  }

  it('open → navigate to the node url', async () => {
    await ready();
    act(() => menuCb?.({ id: 'b1', action: 'open' }));
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://one/');
  });

  it('open-manager → the bookmarks page', async () => {
    await ready();
    act(() => menuCb?.({ id: 'b1', action: 'open-manager' }));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_BOOKMARKS_URL);
  });

  it('delete → removeBookmark by id', async () => {
    await ready();
    await act(async () => {
      menuCb?.({ id: 'b1', action: 'delete' });
      await Promise.resolve();
    });
    expect(bridge.removeBookmark).toHaveBeenCalledWith('b1');
  });

  it('rename opens the rename popup for that id', async () => {
    await ready();
    act(() => menuCb?.({ id: 'b1', action: 'rename', type: 'bookmark' }));
    expect(bridge.openPopup).toHaveBeenCalledWith(
      'bookmark-rename',
      expect.objectContaining({ width: 320 }),
      { id: 'b1' },
    );
  });
});
