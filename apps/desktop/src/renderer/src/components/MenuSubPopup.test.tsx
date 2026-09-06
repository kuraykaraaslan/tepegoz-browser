// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
} from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { MenuSubPopup } from './MenuSubPopup';

/**
 * A submenu flyout window (`?surface=menu-sub&kind=history|bookmarks|extensions`) — its own native
 * window opened beside the main menu. It fetches its own data, builds a `Menu`, and every selection
 * runs a bridge call then `closePopup` (cascading the whole menu shut).
 *
 * One branch is deliberately left uncovered: the `contentRef.current === null` guard in the resize
 * effect. The div holding the ref renders unconditionally, so React has attached it by the time
 * the effect runs.
 */

stubJsdomLayout();

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getHistory: vi.fn(() => Promise.resolve<{ url: string; title: string }[]>([])),
  listRecentlyClosedTabs: vi.fn(() =>
    Promise.resolve<{ id: string; title: string; url: string }[]>([]),
  ),
  listBookmarks: vi.fn(() => Promise.resolve<{ url: string; title: string }[]>([])),
  listExtensionManifests: vi.fn(() =>
    Promise.resolve<
      {
        id: string;
        icon: string;
        name: string;
        description: string;
        labels: Record<string, never>;
      }[]
    >([]),
  ),
  reopenClosedTab: vi.fn(),
  navigateTab: vi.fn(),
  updatePreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getHistory.mockResolvedValue([]);
  bridge.listRecentlyClosedTabs.mockResolvedValue([]);
  bridge.listBookmarks.mockResolvedValue([]);
  bridge.listExtensionManifests.mockResolvedValue([]);
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

/**
 * Hold the NEXT call to `mock` open, and hand back the release. Used to unmount the flyout while a
 * read is still in flight, which is the only way to reach the `cancelled` guards that sit after it.
 */
function stallNext<T>(
  mock: { mockImplementationOnce: (fn: () => Promise<T>) => unknown },
  value: T,
): () => void {
  let release: () => void = () => undefined;
  mock.mockImplementationOnce(
    () =>
      new Promise<T>((res) => {
        release = () => {
          res(value);
        };
      }),
  );
  return () => {
    release();
  };
}

/** Let the stalled promise's continuation run to the point the guard is reached. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('MenuSubPopup', () => {
  it('renders nothing but the shell when the preferences fetch rejects', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('bridge gone'));
    render(<MenuSubPopup kind="history" />);
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('bails out of the data build when unmounted before preferences resolve', async () => {
    let resolvePrefs: (p: typeof DEFAULT_PREFERENCES) => void = () => undefined;
    bridge.getPreferences.mockImplementationOnce(
      () =>
        new Promise<typeof DEFAULT_PREFERENCES>((res) => {
          resolvePrefs = res;
        }),
    );
    const view = render(<MenuSubPopup kind="history" />);
    view.unmount();
    resolvePrefs({ ...DEFAULT_PREFERENCES });
    await Promise.resolve();
    expect(bridge.getHistory).not.toHaveBeenCalled();
  });

  it('closes the whole menu on Escape', async () => {
    render(<MenuSubPopup kind="history" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('uses a stored en/tr locale directly, skipping the navigator fallback', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<MenuSubPopup kind="history" />);
    // Turkish "Show full history"
    expect(await screen.findByRole('menuitem', { name: 'Tüm geçmişi göster' })).toBeTruthy();
  });

  describe('history kind', () => {
    it('lists recently-closed rows, history rows, and "Show full history"; each acts then closes', async () => {
      bridge.listRecentlyClosedTabs.mockResolvedValue([
        { id: 't9', title: 'Closed tab', url: 'https://c/' },
      ]);
      bridge.getHistory.mockResolvedValue([
        { url: 'https://a.example/', title: 'A page' },
        { url: 'https://b.example/', title: '' },
      ]);
      render(<MenuSubPopup kind="history" />);

      fireEvent.click(await screen.findByRole('menuitem', { name: 'Closed tab' }));
      expect(bridge.reopenClosedTab).toHaveBeenCalledWith('t9');
      expect(bridge.closePopup).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('menuitem', { name: 'A page' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith('https://a.example/');
      // a blank title falls back to the URL
      expect(screen.getByRole('menuitem', { name: 'https://b.example/' })).toBeTruthy();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Show full history' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_HISTORY_URL);
    });

    it('falls back to the URL for a recently-closed tab with no title', async () => {
      // The history rows already had this covered; the recently-closed rows are a separate list with
      // a separate label expression, and a closed tab that never finished loading has no title.
      bridge.listRecentlyClosedTabs.mockResolvedValue([
        { id: 't1', title: '', url: 'https://untitled.example/' },
      ]);
      render(<MenuSubPopup kind="history" />);
      expect(
        await screen.findByRole('menuitem', { name: 'https://untitled.example/' }),
      ).toBeTruthy();
    });

    it('omits the recently-closed section and still lists "Show full history" when both reads reject', async () => {
      bridge.getHistory.mockRejectedValueOnce(new Error('x'));
      bridge.listRecentlyClosedTabs.mockRejectedValueOnce(new Error('x'));
      render(<MenuSubPopup kind="history" />);
      expect(await screen.findByRole('menuitem', { name: 'Show full history' })).toBeTruthy();
      expect(screen.queryByText('Recently closed')).toBeNull();
    });
  });

  describe('bookmarks kind', () => {
    it('shows the bar toggle with a check when the bar is on, and flips the preference', async () => {
      bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, showBookmarksBar: true });
      bridge.listBookmarks.mockResolvedValue([{ url: 'https://bm/', title: 'A bookmark' }]);
      render(<MenuSubPopup kind="bookmarks" />);

      fireEvent.click(await screen.findByRole('menuitem', { name: /Show bookmarks bar/ }));
      expect(bridge.updatePreferences).toHaveBeenCalledWith({ showBookmarksBar: false });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Bookmark manager' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_BOOKMARKS_URL);

      fireEvent.click(screen.getByRole('menuitem', { name: 'A bookmark' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith('https://bm/');
    });

    it('falls back to the URL for a bookmark with no title', async () => {
      bridge.listBookmarks.mockResolvedValue([{ url: 'https://untitled-bm.example/', title: '' }]);
      render(<MenuSubPopup kind="bookmarks" />);
      expect(
        await screen.findByRole('menuitem', { name: 'https://untitled-bm.example/' }),
      ).toBeTruthy();
    });

    it('shows the disabled empty row when there are no bookmarks', async () => {
      bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, showBookmarksBar: false });
      bridge.listBookmarks.mockRejectedValueOnce(new Error('x'));
      render(<MenuSubPopup kind="bookmarks" />);
      expect(await screen.findByText('No bookmarks yet')).toBeTruthy();
    });
  });

  describe('extensions kind', () => {
    it('lists enabled extensions and the "Manage extensions" row', async () => {
      bridge.getPreferences.mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        extensions: [
          { id: 'com.tepegoz.tasks', status: 'enabled' },
          { id: 'com.tepegoz.disabled', status: 'disabled' },
        ],
      });
      const man = (id: string, name: string) => ({
        id,
        icon: 'list-check',
        name,
        description: '',
        labels: {} as Record<string, never>,
      });
      bridge.listExtensionManifests.mockResolvedValue([
        man('com.tepegoz.tasks', 'Scheduled Tasks'),
        man('com.tepegoz.disabled', 'Disabled One'),
      ]);
      render(<MenuSubPopup kind="extensions" />);

      // an enabled extension is listed by its manifest name; clicking it opens its page
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Scheduled Tasks' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://com.tepegoz.tasks');

      fireEvent.click(screen.getByRole('menuitem', { name: 'Manage extensions' }));
      expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_EXTENSIONS_URL);
    });

    it('still shows "Manage extensions" when the manifest list rejects', async () => {
      bridge.listExtensionManifests.mockRejectedValueOnce(new Error('x'));
      render(<MenuSubPopup kind="extensions" />);
      expect(await screen.findByRole('menuitem', { name: 'Manage extensions' })).toBeTruthy();
    });
  });

  describe('a read that lands after the flyout is gone', () => {
    // A flyout is a native popup that closes on a click anywhere, so its data routinely arrives after
    // it is gone. These drive that race end to end for all three kinds: unmount with the read still
    // in flight, then let it land.
    //
    // What they pin is the PATH, not the `cancelled` guard itself — checked by mutation: deleting the
    // guard keeps them green, because React 18 makes a state update on an unmounted tree a silent
    // no-op, so the guard has no externally observable effect to assert on. They are here because the
    // path is a real one that must complete without throwing, and because anything later added after
    // the guard (a bridge call, a map over a late payload) would break them.

    it('drops a late recently-closed read', async () => {
      const release = stallNext(bridge.listRecentlyClosedTabs, []);
      const view = render(<MenuSubPopup kind="history" />);
      await waitFor(() => expect(bridge.listRecentlyClosedTabs).toHaveBeenCalled());
      view.unmount();
      release();
      await flush();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('drops a late bookmarks read', async () => {
      const release = stallNext(bridge.listBookmarks, []);
      const view = render(<MenuSubPopup kind="bookmarks" />);
      await waitFor(() => expect(bridge.listBookmarks).toHaveBeenCalled());
      view.unmount();
      release();
      await flush();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('drops a late extension-manifest read', async () => {
      const release = stallNext(bridge.listExtensionManifests, []);
      const view = render(<MenuSubPopup kind="extensions" />);
      await waitFor(() => expect(bridge.listExtensionManifests).toHaveBeenCalled());
      view.unmount();
      release();
      await flush();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });
  });
});
