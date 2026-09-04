// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { BOOKMARK_ROOT_BAR } from '@tepegoz/bookmarks';
import type { BookmarkMenuAction, BookmarkTreeNode } from '@tepegoz/desktop-ipc';
import { bookmarksUiDict } from '@tepegoz/bookmarks-ui/i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { BookmarkFolderPopup } from './BookmarkFolderPopup';

/**
 * A bar folder's dropdown as its own native window. Fetches the tree, renders the folder's contents
 * (subfolders expand inline), navigates + closes on a bookmark click, and handles the reduced native
 * context menu's action sent back from main (open / open-new-tab / open-all / move-to-bar / delete).
 */

stubJsdomLayout();

let menuActionCb: (a: BookmarkMenuAction) => void = () => {};

let n = 0;
const bm = (title: string, url: string, favicon: string | null = null): BookmarkTreeNode => ({
  id: `b${String(n++)}`,
  parentId: 'f-root',
  type: 'bookmark',
  title,
  url,
  favicon,
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  tags: [],
  children: [],
});
const folder = (id: string, title: string, children: BookmarkTreeNode[]): BookmarkTreeNode => ({
  id,
  parentId: null,
  type: 'folder',
  title,
  url: null,
  favicon: null,
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  tags: [],
  children,
});

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getBookmarkTree: vi.fn<() => Promise<BookmarkTreeNode[]>>(() => Promise.resolve([])),
  onBookmarkMenuAction: vi.fn((cb: (a: BookmarkMenuAction) => void) => {
    menuActionCb = cb;
    return () => undefined;
  }),
  navigateTab: vi.fn(),
  createTabInBackground: vi.fn<(url: string) => void>(),
  moveBookmark: vi.fn(() => Promise.resolve()),
  removeBookmark: vi.fn(() => Promise.resolve()),
  showBookmarkContextMenu: vi.fn(),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  n = 0;
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getBookmarkTree.mockResolvedValue([]);
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

describe('BookmarkFolderPopup', () => {
  it('shows the empty-folder message when the folder has no children', async () => {
    bridge.getBookmarkTree.mockResolvedValue([folder('f-root', 'Bar folder', [])]);
    render(<BookmarkFolderPopup folderId="f-root" />);
    await waitFor(() =>
      expect(screen.getByText(bookmarksUiDict.en.emptyFolder)).toBeTruthy(),
    );
  });

  it('shows the empty message too when the tree read rejects', async () => {
    bridge.getBookmarkTree.mockRejectedValueOnce(new Error('store gone'));
    render(<BookmarkFolderPopup folderId="f-root" />);
    await waitFor(() =>
      expect(screen.getByText(bookmarksUiDict.en.emptyFolder)).toBeTruthy(),
    );
  });

  it('renders the folder contents, expands a subfolder inline, navigates on a bookmark click', async () => {
    bridge.getBookmarkTree.mockResolvedValue([
      folder('f-root', 'Bar folder', [
        bm('Alpha', 'https://alpha/', 'data:image/png;base64,AA'),
        bm('', 'https://untitled/'),
        folder('f-sub', 'Sub', [bm('Nested', 'https://nested/')]),
      ]),
    ]);
    render(<BookmarkFolderPopup folderId="f-root" />);

    await screen.findByText('Alpha');
    // a blank title falls back to the URL
    expect(screen.getByText('https://untitled/')).toBeTruthy();
    // nested item is hidden until the subfolder is expanded
    expect(screen.queryByText('Nested')).toBeNull();
    fireEvent.click(screen.getByText('Sub'));
    expect(screen.getByText('Nested')).toBeTruthy();

    fireEvent.click(screen.getByText('Alpha'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://alpha/');
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('opens the reduced context menu for a bookmark row and for a folder branch', async () => {
    bridge.getBookmarkTree.mockResolvedValue([
      folder('f-root', 'Bar folder', [
        bm('Alpha', 'https://alpha/'),
        folder('f-sub', 'Sub', []),
      ]),
    ]);
    render(<BookmarkFolderPopup folderId="f-root" />);
    fireEvent.contextMenu(await screen.findByText('Alpha'));
    fireEvent.contextMenu(screen.getByText('Sub'));
    expect(bridge.showBookmarkContextMenu).toHaveBeenCalledWith('b0', 'bookmark', 'folder-item');
    expect(bridge.showBookmarkContextMenu).toHaveBeenCalledWith('f-sub', 'folder', 'folder-item');
  });

  it('falls back to the bookmark glyph when a favicon image fails to load', async () => {
    bridge.getBookmarkTree.mockResolvedValue([
      folder('f-root', 'Bar folder', [bm('Broken', 'https://x/', 'https://broken.example/favicon.ico')]),
    ]);
    render(<BookmarkFolderPopup folderId="f-root" />);
    const row = await screen.findByText('Broken');
    const img = row.closest('button')?.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(row.closest('button')?.querySelector('img')).toBeNull(); // swapped for the svg glyph
  });

  it('still renders the contents when the preferences fetch rejects', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('prefs gone'));
    bridge.getBookmarkTree.mockResolvedValue([folder('f-root', 'Bar', [bm('Alpha', 'https://a/')])]);
    render(<BookmarkFolderPopup folderId="f-root" />);
    expect(await screen.findByText('Alpha')).toBeTruthy();
  });

  it('honours a stored tr locale for the empty message', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    bridge.getBookmarkTree.mockResolvedValue([folder('f-root', 'Bar', [])]);
    render(<BookmarkFolderPopup folderId="f-root" />);
    await waitFor(() =>
      expect(screen.getByText(bookmarksUiDict.tr.emptyFolder)).toBeTruthy(),
    );
  });

  it('closes on Escape', async () => {
    render(<BookmarkFolderPopup folderId="f-root" />);
    await waitFor(() => expect(bridge.onBookmarkMenuAction).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  describe('the native context-menu action sent back from main', () => {
    beforeEach(async () => {
      bridge.getBookmarkTree.mockResolvedValue([
        folder('f-root', 'Bar folder', [
          bm('Alpha', 'https://alpha/'),
          folder('f-sub', 'Sub', [bm('Nested1', 'https://n1/'), bm('Nested2', 'https://n2/')]),
        ]),
      ]);
      render(<BookmarkFolderPopup folderId="f-root" />);
      await screen.findByText('Alpha');
    });

    const fire = (action: BookmarkMenuAction['action'], id: string): void => {
      menuActionCb({ action, id, type: id.startsWith('f') ? 'folder' : 'bookmark' });
    };

    it('open → navigateTab, open-new-tab → background tab', () => {
      fire('open', 'b0');
      expect(bridge.navigateTab).toHaveBeenCalledWith('https://alpha/');
      fire('open-new-tab', 'b0');
      expect(bridge.createTabInBackground).toHaveBeenCalledWith('https://alpha/');
    });

    it('open-all collects every descendant url into background tabs', () => {
      fire('open-all', 'f-sub');
      expect(bridge.createTabInBackground.mock.calls.map((c) => c[0])).toEqual([
        'https://n1/',
        'https://n2/',
      ]);
    });

    it('move-to-bar → moveBookmark(id, ROOT_BAR, end); delete → removeBookmark(id)', () => {
      fire('move-to-bar', 'b0');
      expect(bridge.moveBookmark).toHaveBeenCalledWith('b0', BOOKMARK_ROOT_BAR, 100000);
      fire('delete', 'b0');
      expect(bridge.removeBookmark).toHaveBeenCalledWith('b0');
    });

    it('closes the popup after every handled action', () => {
      fire('open', 'b0');
      expect(bridge.closePopup).toHaveBeenCalled();
    });
  });
});
