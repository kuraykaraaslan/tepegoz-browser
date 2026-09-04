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
 */

stubJsdomLayout();

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getHistory: vi.fn(() => Promise.resolve<{ url: string; title: string }[]>([])),
  listRecentlyClosedTabs: vi.fn(() => Promise.resolve<{ id: string; title: string; url: string }[]>([])),
  listBookmarks: vi.fn(() => Promise.resolve<{ url: string; title: string }[]>([])),
  listExtensionManifests: vi.fn(() =>
    Promise.resolve<
      { id: string; icon: string; name: string; description: string; labels: Record<string, never> }[]
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
      () => new Promise<typeof DEFAULT_PREFERENCES>((res) => { resolvePrefs = res; }),
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
      bridge.listRecentlyClosedTabs.mockResolvedValue([{ id: 't9', title: 'Closed tab', url: 'https://c/' }]);
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
});
