import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The history + bookmarks + notification-center + HITL-prompt slice of the preload bridge (~50
 * methods, one shape). What's pinned is the payload SHAPE each method wraps its args in, the
 * fire-and-forget `ipcRenderer.send` calls (vs `invoke`), and that every `on*` subscription wires a
 * listener and removes exactly that listener on its returned fn.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { bookmarksHistoryApi: api } = await import('./api-bookmarks-history');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

describe('request/response payload shapes', () => {
  it('searchHistory forwards the whole params object (incl. forOmnibox)', () => {
    void api.searchHistory({ query: 'weather', limit: 8, forOmnibox: true });
    expect(invoke).toHaveBeenCalledWith(IpcChannels.historySearch, {
      query: 'weather',
      limit: 8,
      forOmnibox: true,
    });
  });

  it('getPageInfo wraps the url in an object', () => {
    void api.getPageInfo('https://ex.test/');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.pageInfoGet, { url: 'https://ex.test/' });
  });

  it('toggleBookmark → { url, title, favicon }', () => {
    void api.toggleBookmark('https://ex.test/', 'Ex', null);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.bookmarksToggle, {
      url: 'https://ex.test/',
      title: 'Ex',
      favicon: null,
    });
  });

  it('setBookmarkTags → { id, tags }', () => {
    void api.setBookmarkTags('b1', ['work', 'read']);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.bookmarksSetTags, {
      id: 'b1',
      tags: ['work', 'read'],
    });
  });

  it('createBookmarkFolder → { parentId, title, index }', () => {
    void api.createBookmarkFolder('root', 'New', 2);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.bookmarksCreateFolder, {
      parentId: 'root',
      title: 'New',
      index: 2,
    });
  });

  it('moveBookmark → { id, newParentId, index }', () => {
    void api.moveBookmark('b1', 'folder-2', 0);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.bookmarksMove, {
      id: 'b1',
      newParentId: 'folder-2',
      index: 0,
    });
  });

  it('bare-arg methods pass the arg straight through', () => {
    void api.deleteHistory('https://ex.test/');
    void api.isBookmarked('https://ex.test/');
    void api.importBookmarkProfile('chrome:abc');
    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannels.historyDelete, 'https://ex.test/');
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IpcChannels.bookmarksIsBookmarked,
      'https://ex.test/',
    );
    expect(invoke).toHaveBeenNthCalledWith(3, IpcChannels.bookmarksImportProfile, 'chrome:abc');
  });
});

describe('fire-and-forget (ipcRenderer.send, not invoke)', () => {
  it('sendScreenshotEncoded → { requestId, bytes }', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    api.sendScreenshotEncoded('req-1', bytes);
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.screenshotEncoded, {
      requestId: 'req-1',
      bytes,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('showBookmarkContextMenu → { id, type, variant }', () => {
    api.showBookmarkContextMenu('b1', 'bookmark', 'folder-item');
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.bookmarksContextMenu, {
      id: 'b1',
      type: 'bookmark',
      variant: 'folder-item',
    });
  });

  it('the notification-center mutations are bare sends', () => {
    api.dismissNotification('n1');
    api.dismissAllNotifications();
    api.markNotificationRead('n1');
    api.markAllNotificationsRead();
    expect(ipc.send.mock.calls).toEqual([
      [IpcChannels.notificationsDismiss, 'n1'],
      [IpcChannels.notificationsDismissAll],
      [IpcChannels.notificationsMarkRead, 'n1'],
      [IpcChannels.notificationsMarkAllRead],
    ]);
  });

  it('respondBasicAuth forwards the response verbatim', () => {
    const response = { requestId: 'a1', cancelled: true, username: '', password: '' };
    api.respondBasicAuth(response);
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.authBasicRespond, response);
  });
});

describe('subscriptions', () => {
  it('onBookmarksChanged fires a zero-arg callback and unsubscribes cleanly', () => {
    const cb = vi.fn();
    const off = api.onBookmarksChanged(cb);
    const listener = ipc.on.mock.calls[0]![1] as () => void;
    listener();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.bookmarksChanged, listener);
  });

  it('onScreenshotEncode forwards the whole payload', () => {
    const cb = vi.fn();
    api.onScreenshotEncode(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    const payload = { requestId: 'r', png: new Uint8Array(), quality: 80 };
    listener({}, payload);
    expect(cb).toHaveBeenCalledWith(payload);
  });

  it('onReaderToggle forwards nothing (a bare signal)', () => {
    const cb = vi.fn();
    const off = api.onReaderToggle(cb);
    const listener = ipc.on.mock.calls[0]![1] as () => void;
    listener();
    expect(cb).toHaveBeenCalledWith();
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.readerToggle, listener);
  });
});
