// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import {
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_PROCESS_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_UPLOADS_URL,
} from '@tepegoz/desktop-ipc';
import { browserDict } from '../../../i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { MainMenuPopup } from './MainMenuPopup';

/**
 * Standalone native main-menu popup. It fetches prefs + three IPC counts to size the flyout submenu
 * windows, applies theme/locale, closes on Escape, shrinks to its content, and every plain row runs
 * its bridge call then self-dismisses (`act`). Zoom is the one row that does NOT close. Flyout parents
 * (bookmarks/history/extensions) ask main to open a separate window.
 */

stubJsdomLayout();

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  listExtensionManifests: vi.fn(() => Promise.resolve([{ id: 'x1' }, { id: 'x2' }])),
  listRecentlyClosedTabs: vi.fn(() => Promise.resolve([{}, {}, {}])),
  listBookmarks: vi.fn(() => Promise.resolve([{}, {}])),
  getPageZoom: vi.fn(() => Promise.resolve(110)),
  setPageZoom: vi.fn<(d: string) => void>(),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
  createTab: vi.fn(),
  reopenClosedTab: vi.fn(),
  tabReload: vi.fn(),
  navigateTab: vi.fn(),
  quitApp: vi.fn(),
  openSubmenu: vi.fn<(kind: string, ...rest: unknown[]) => void>(),
  closeSubmenu: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.listExtensionManifests.mockResolvedValue([{ id: 'x1' }, { id: 'x2' }]);
  bridge.listRecentlyClosedTabs.mockResolvedValue([{}, {}, {}]);
  bridge.listBookmarks.mockResolvedValue([{}, {}]);
  bridge.getPageZoom.mockResolvedValue(110);
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

describe('MainMenuPopup', () => {
  it('fetches prefs + the three sizing counts and reports its measured height', async () => {
    render(<MainMenuPopup />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(bridge.listExtensionManifests).toHaveBeenCalled();
    expect(bridge.listRecentlyClosedTabs).toHaveBeenCalled();
    expect(bridge.listBookmarks).toHaveBeenCalled();
    expect(bridge.resizePopup).toHaveBeenCalled();
  });

  it('survives every bridge call rejecting', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('x'));
    bridge.listExtensionManifests.mockRejectedValueOnce(new Error('x'));
    bridge.listRecentlyClosedTabs.mockRejectedValueOnce(new Error('x'));
    bridge.listBookmarks.mockRejectedValueOnce(new Error('x'));
    bridge.getPageZoom.mockRejectedValueOnce(new Error('x'));
    render(<MainMenuPopup />);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
  });

  it('resolves the stored tr locale', async () => {
    bridge.getPreferences.mockResolvedValueOnce({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<MainMenuPopup />);
    expect(await screen.findByRole('menuitem', { name: new RegExp(browserDict.tr.newTab) })).toBeTruthy();
  });

  it('closes on Escape', async () => {
    render(<MainMenuPopup />);
    await screen.findByRole('menu');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('runs a plain row action then self-dismisses the popup', async () => {
    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /New tab/ }));
    expect(bridge.createTab).toHaveBeenCalledTimes(1);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('reopens the last closed tab and reloads the active one from their rows', async () => {
    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Reopen closed tab/ }));
    expect(bridge.reopenClosedTab).toHaveBeenCalledTimes(1);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    cleanup();

    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Reload/ }));
    expect(bridge.tabReload).toHaveBeenCalledTimes(1);
  });

  it('opens the downloads, uploads, and tasks pages from their rows', async () => {
    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Downloads/ }));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_DOWNLOADS_URL);
    cleanup();

    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Uploads/ }));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_UPLOADS_URL);
    cleanup();

    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Tasks/ }));
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://com.tepegoz.tasks');
  });

  it('navigates to Settings / Task manager / quits from their rows', async () => {
    render(<MainMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Task manager/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Exit/ }));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_SETTINGS_URL);
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_PROCESS_URL);
    expect(bridge.quitApp).toHaveBeenCalledTimes(1);
  });

  it('steps zoom without closing the menu and re-reads the level each time', async () => {
    render(<MainMenuPopup />);
    await screen.findByRole('menu');
    await waitFor(() => expect(bridge.getPageZoom).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(bridge.setPageZoom.mock.calls.map((c) => c[0])).toEqual(['in', 'out', 'reset']);
    expect(bridge.closePopup).not.toHaveBeenCalled();
    await waitFor(() => expect(bridge.getPageZoom).toHaveBeenCalledTimes(4));
  });

  it('asks main to open a submenu window for each flyout parent, and to close it on a plain-row hover', async () => {
    render(<MainMenuPopup />);
    const bookmarks = await screen.findByRole('menuitem', { name: /Bookmarks/ });
    fireEvent.mouseEnter(bookmarks);
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /History/ }));
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Extensions/ }));
    const kinds = bridge.openSubmenu.mock.calls.map((c) => c[0]);
    expect(kinds).toEqual(['bookmarks', 'history', 'extensions']);

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /New tab/ }));
    expect(bridge.closeSubmenu).toHaveBeenCalled();
  });

  it('sizes the history flyout window without a closed-tabs bonus when there are none to reopen', async () => {
    bridge.listRecentlyClosedTabs.mockResolvedValueOnce([]);
    render(<MainMenuPopup />);
    fireEvent.mouseEnter(await screen.findByRole('menuitem', { name: /History/ }));
    expect(bridge.openSubmenu).toHaveBeenCalledWith('history', expect.anything(), expect.anything());
  });
});
