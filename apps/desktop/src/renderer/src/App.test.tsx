// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import type { AppNotification, NotificationPermissionRequest, TabsState } from '@tepegoz/desktop-ipc';
import type { ExtensionDef } from './extensions/registry';
import type { BookmarksBarResult } from './app-bookmarks';
import type { ExtensionSurfacesResult } from './app-extension-surfaces';
import type { OmniboxHistoryResult } from './app-omnibox-history';
import type { ReaderResult } from './app-reader';
import type { AppEffectsParams } from './App-effects';
import { useExtensionCatalog } from './extensions/useExtensionCatalog';
import { useBookmarksBar } from './app-bookmarks';
import { useExtensionSurfaces, AGENT_PANEL_OPEN_KEY } from './app-extension-surfaces';
import { useOmniboxAndHistory } from './app-omnibox-history';
import { useReader } from './app-reader';
import { useWindowMaximized } from './lib/useWindowMaximized';
import { useAppEffects } from './App-effects';
import { useCommandPalette, CommandPaletteHost } from './command-palette-host';
import { AppChrome, type AppChromeProps } from './App-chrome';
import { AppContent, type AppContentProps } from './App-content';
import { AppOverlays, type AppOverlaysProps } from './App-overlays';
import { CursorOverlay } from './components/CursorOverlay';
import { App } from './App';

/**
 * The window-shell root — split into `AppChrome`/`AppContent`/`AppOverlays`/`App-effects`/a dozen
 * `use*` hooks (ADR-0010), each already fully covered on its own. `App.tsx` itself is almost pure
 * WIRING: it owns a handful of `useState`s, derives a few values from them, and hands both down to
 * its children/hooks. So every dependency is mocked to a capturing stub (children → `vi.fn(() =>
 * null)`, hooks → `vi.fn()` returning a fixture) and the test drives App's OWN inline closures and
 * derived values directly off the captured call args — exactly the `App-chrome.test.tsx` /
 * `App-overlays.test.tsx` techniques, combined at the root.
 */

vi.mock('./extensions/useExtensionCatalog', () => ({ useExtensionCatalog: vi.fn() }));
vi.mock('./app-bookmarks', () => ({ useBookmarksBar: vi.fn() }));
vi.mock('./app-extension-surfaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./app-extension-surfaces')>();
  return { ...actual, useExtensionSurfaces: vi.fn() };
});
vi.mock('./app-omnibox-history', () => ({ useOmniboxAndHistory: vi.fn() }));
vi.mock('./app-reader', () => ({ useReader: vi.fn() }));
vi.mock('./app-screenshot-encoder', () => ({ useScreenshotEncoder: vi.fn() }));
vi.mock('./lib/useWindowMaximized', () => ({ useWindowMaximized: vi.fn(() => false) }));
vi.mock('./App-effects', () => ({ useAppEffects: vi.fn() }));
vi.mock('./command-palette-host', () => ({
  useCommandPalette: vi.fn(),
  CommandPaletteHost: vi.fn(() => null),
}));
vi.mock('./App-chrome', () => ({ AppChrome: vi.fn(() => null) }));
vi.mock('./App-content', () => ({ AppContent: vi.fn(() => null) }));
vi.mock('./App-overlays', () => ({ AppOverlays: vi.fn(() => null) }));
vi.mock('./components/CursorOverlay', () => ({ CursorOverlay: vi.fn(() => null) }));

const bridge = {
  onReaderToggle: vi.fn<(cb: () => void) => () => void>(() => () => undefined),
  respondNotificationPermission: vi.fn(),
  updatePreferences: vi.fn(() => Promise.resolve({})),
  navigateTab: vi.fn(),
};

function extSurfacesFixture(over: Partial<ExtensionSurfacesResult> = {}): ExtensionSurfacesResult {
  return {
    activeSurface: null,
    sidebarExtId: null,
    popupOpenId: null,
    sidebarWidth: 360,
    resizingSidebar: false,
    resizeSnapshot: null,
    closeSurface: vi.fn(),
    closeSidebar: vi.fn(),
    runExtensionAction: vi.fn(),
    onSidebarResizeStart: vi.fn(),
    renderActiveSurface: () => null,
    renderSidebar: () => null,
    ...over,
  };
}

function bookmarksFixture(over: Partial<BookmarksBarResult> = {}): BookmarksBarResult {
  return {
    activeBookmarked: false,
    barNodes: [],
    canBookmark: true,
    bookmarksRef: { current: [] },
    openAllUrls: null,
    setOpenAllUrls: vi.fn(),
    onToggleBookmark: vi.fn(() => Promise.resolve()),
    onBookmarkMove: vi.fn(),
    findBarNode: vi.fn(() => null),
    ...over,
  };
}

function omniboxHistoryFixture(): OmniboxHistoryResult {
  return {
    onOmniboxSuggest: vi.fn(() => Promise.resolve([])),
    onActivateTabFromOmnibox: vi.fn(),
    onAgentTaskFromOmnibox: vi.fn(),
    onRunSkillFromOmnibox: vi.fn(),
    onOpenDownloadFromOmnibox: vi.fn(),
  };
}

function readerFixture(over: Partial<ReaderResult> = {}): ReaderResult {
  return { reader: { status: 'off' }, toggleReader: vi.fn(), closeReader: vi.fn(), ...over };
}

function tabsState(over: Partial<TabsState> = {}): TabsState {
  return {
    tabs: [],
    groups: [],
    activeId: null,
    canGoBack: false,
    canGoForward: false,
    isPrivate: false,
    activeZoomFactor: 1,
    activeSecurityLevel: 'unknown',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
  vi.mocked(useExtensionCatalog).mockReturnValue({ registry: [], ready: true });
  vi.mocked(useBookmarksBar).mockReturnValue(bookmarksFixture());
  vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfacesFixture());
  vi.mocked(useOmniboxAndHistory).mockReturnValue(omniboxHistoryFixture());
  vi.mocked(useReader).mockReturnValue(readerFixture());
  vi.mocked(useWindowMaximized).mockReturnValue(false);
  vi.mocked(useCommandPalette).mockReturnValue({ open: false, setOpen: vi.fn() });
  bridge.onReaderToggle.mockImplementation(() => () => undefined);
  bridge.updatePreferences.mockImplementation(() => Promise.resolve({}));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

function lastAppChromeProps(): AppChromeProps {
  const calls = vi.mocked(AppChrome).mock.calls;
  return calls[calls.length - 1]![0];
}
function lastAppContentProps(): AppContentProps {
  const calls = vi.mocked(AppContent).mock.calls;
  return calls[calls.length - 1]![0];
}
function lastAppOverlaysProps(): AppOverlaysProps {
  const calls = vi.mocked(AppOverlays).mock.calls;
  return calls[calls.length - 1]![0];
}
function lastAppEffectsParams(): AppEffectsParams {
  const calls = vi.mocked(useAppEffects).mock.calls;
  return calls[calls.length - 1]![0];
}

describe('App', () => {
  it('renders the full shell and wires the same tabs/extSurfaces/bookmarks into the chrome and content', () => {
    const tabs = tabsState({ activeId: 't1', tabs: [{ id: 't1' } as never] });
    const extSurfaces = extSurfacesFixture();
    const bookmarks = bookmarksFixture();
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfaces);
    vi.mocked(useBookmarksBar).mockReturnValue(bookmarks);
    render(<App />);
    act(() => lastAppEffectsParams().setTabs(tabs));

    expect(lastAppChromeProps().tabs).toBe(tabs);
    expect(lastAppChromeProps().extSurfaces).toBe(extSurfaces);
    expect(lastAppContentProps().extSurfaces).toBe(extSurfaces);
    expect(lastAppChromeProps().bookmarks).toBe(bookmarks);
    expect(vi.mocked(CommandPaletteHost)).toHaveBeenCalled();
    expect(vi.mocked(CursorOverlay)).toHaveBeenCalled();
  });

  it('kiosk mode renders only the content surface, never mounting the chrome', () => {
    window.history.pushState({}, '', '/?kiosk=1');
    const { container } = render(<App />);
    expect(vi.mocked(AppChrome)).not.toHaveBeenCalled();
    expect(vi.mocked(AppOverlays)).not.toHaveBeenCalled();
    expect(container.querySelector('.bg-surface-base')).toBeTruthy();
  });

  it('dismissToast removes only the given toast from the list', () => {
    render(<App />);
    const toasts: AppNotification[] = [{ id: 'a' } as never, { id: 'b' } as never];
    act(() => lastAppEffectsParams().setToasts(toasts));
    expect(lastAppOverlaysProps().toasts).toEqual(toasts);

    act(() => lastAppOverlaysProps().dismissToast('a'));
    expect(lastAppOverlaysProps().toasts).toEqual([{ id: 'b' }]);
  });

  it('answerPermission is a no-op with no pending request, then responds and clears it once one exists', () => {
    render(<App />);
    act(() => lastAppOverlaysProps().answerPermission(true, true));
    expect(bridge.respondNotificationPermission).not.toHaveBeenCalled();

    const req: NotificationPermissionRequest = { requestId: 'r1', origin: 'https://a.example', capability: 'notifications' };
    act(() => lastAppEffectsParams().setPermReq(req));
    expect(lastAppOverlaysProps().permReq).toBe(req);

    act(() => lastAppOverlaysProps().answerPermission(true, false));
    expect(bridge.respondNotificationPermission).toHaveBeenCalledWith({
      requestId: 'r1',
      allow: true,
      remember: false,
    });
    expect(lastAppOverlaysProps().permReq).toBeNull();
  });

  it('onOmniboxDropdownHeightChange clamps to a non-negative integer and reports whether the dropdown is open', () => {
    render(<App />);
    act(() => lastAppChromeProps().onOmniboxDropdownHeightChange(-5));
    expect(lastAppEffectsParams().omniboxDropdownOpen).toBe(false);

    act(() => lastAppChromeProps().onOmniboxDropdownHeightChange(12.2));
    expect(lastAppEffectsParams().omniboxDropdownOpen).toBe(true);

    // same rounded height again → the updater's no-op branch (still open, no observable change)
    act(() => lastAppChromeProps().onOmniboxDropdownHeightChange(12.4));
    expect(lastAppEffectsParams().omniboxDropdownOpen).toBe(true);
  });

  it('onUpdatePrefs writes through the bridge and threads the result back to prefs-dependent children', async () => {
    bridge.updatePreferences.mockResolvedValueOnce({ locale: 'tr' });
    render(<App />);
    await act(async () => {
      await lastAppContentProps().onUpdatePrefs({ locale: 'tr' });
    });
    expect(bridge.updatePreferences).toHaveBeenCalledWith({ locale: 'tr' });
    expect(lastAppChromeProps().prefs).toEqual({ locale: 'tr' });
  });

  it('onOpenQuickSetting closes any extension surface and navigates to the mapped settings section', () => {
    const extSurfaces = extSurfacesFixture();
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfaces);
    render(<App />);
    act(() => lastAppChromeProps().onOpenQuickSetting('privacy'));
    expect(extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
    expect(bridge.navigateTab).toHaveBeenCalledWith(`${INTERNAL_SETTINGS_URL}#privacy`);
  });

  it('onReorderPinned writes the new pinned order and logs a rejected write instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App />);
    act(() => lastAppChromeProps().onReorderPinned(['x', 'y']));
    expect(bridge.updatePreferences).toHaveBeenCalledWith({ pinnedExtensions: ['x', 'y'] });

    bridge.updatePreferences.mockRejectedValueOnce(new Error('vault locked'));
    await act(async () => {
      lastAppChromeProps().onReorderPinned(['z']);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(errorSpy).toHaveBeenCalledWith('Pinned extension reorder failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('onUnpinExtension removes a pinned id, and does nothing for one that was never pinned', () => {
    render(<App />);
    act(() => lastAppEffectsParams().onUnpinExtension('a')); // prefs not loaded yet → nothing pinned
    expect(bridge.updatePreferences).not.toHaveBeenCalled();

    act(() => lastAppEffectsParams().setPrefs({ pinnedExtensions: ['a', 'b'] } as never));

    act(() => lastAppEffectsParams().onUnpinExtension('missing'));
    expect(bridge.updatePreferences).not.toHaveBeenCalled();

    act(() => lastAppEffectsParams().onUnpinExtension('a'));
    expect(bridge.updatePreferences).toHaveBeenCalledWith({ pinnedExtensions: ['b'] });
  });

  it('onToggleExtension enabling an extension writes its state and leaves any open surface alone', async () => {
    const extSurfaces = extSurfacesFixture({ activeSurface: { id: 'ext-a', kind: 'modal' } });
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfaces);
    render(<App />);
    await act(async () => {
      lastAppEffectsParams().onToggleExtension('ext-a', true);
      await Promise.resolve();
    });
    expect(bridge.updatePreferences).toHaveBeenCalledWith({
      extensions: [{ id: 'ext-a', status: 'enabled' }],
    });
    expect(extSurfaces.closeSurface).not.toHaveBeenCalled();
  });

  it('onToggleExtension disabling the extension currently shown closes its surface and sidebar dock', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const extSurfaces = extSurfacesFixture({
      activeSurface: { id: 'ext-a', kind: 'panel' },
      sidebarExtId: 'ext-a',
    });
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfaces);
    bridge.updatePreferences.mockRejectedValueOnce(new Error('write failed'));
    render(<App />);
    await act(async () => {
      lastAppEffectsParams().onToggleExtension('ext-a', false);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
    expect(extSurfaces.closeSidebar).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Extension toggle failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('onToggleExtension disabling an extension that is neither the open surface nor the dock touches neither', () => {
    const extSurfaces = extSurfacesFixture({ activeSurface: { id: 'other', kind: 'modal' }, sidebarExtId: 'other' });
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfaces);
    render(<App />);
    act(() => lastAppEffectsParams().onToggleExtension('ext-a', false));
    expect(extSurfaces.closeSurface).not.toHaveBeenCalled();
    expect(extSurfaces.closeSidebar).not.toHaveBeenCalled();
  });

  it('subscribes the reader-toggle shortcut to the current toggleReader and unsubscribes on unmount', () => {
    let unsubscribed = false;
    const toggleReader = vi.fn();
    bridge.onReaderToggle.mockImplementation(() => () => {
      unsubscribed = true;
    });
    vi.mocked(useReader).mockReturnValue(readerFixture({ toggleReader }));
    const { unmount } = render(<App />);
    expect(bridge.onReaderToggle).toHaveBeenCalledWith(toggleReader);
    unmount();
    expect(unsubscribed).toBe(true);
  });

  it('derives no active group (and no remembered Agent Console state) when there is no active tab', () => {
    render(<App />);
    act(() => lastAppEffectsParams().setTabs(tabsState({ activeId: null })));
    const call = vi.mocked(useExtensionSurfaces).mock.calls.at(-1)!;
    expect(call[1]).toBeNull();
    expect(call[2]).toBeUndefined();
  });

  it('derives the active group id and its remembered Agent Console state from the active tab and its group', () => {
    render(<App />);
    act(() =>
      lastAppEffectsParams().setTabs(
        tabsState({
          activeId: 't1',
          tabs: [{ id: 't1', groupId: 'g1' } as never],
          groups: [{ id: 'g1', settings: { [AGENT_PANEL_OPEN_KEY]: true } } as never],
        }),
      ),
    );
    const call = vi.mocked(useExtensionSurfaces).mock.calls.at(-1)!;
    expect(call[1]).toBe('g1');
    expect(call[2]).toBe(true);
  });

  it('currentUrl falls back to the empty string with no active tab, and reads the active tab\'s url otherwise', () => {
    render(<App />);
    expect(lastAppContentProps().currentUrl).toBe('');
    act(() =>
      lastAppEffectsParams().setTabs(
        tabsState({ activeId: 't1', tabs: [{ id: 't1', url: 'https://a.example' } as never] }),
      ),
    );
    expect(lastAppContentProps().currentUrl).toBe('https://a.example');
  });

  it('enabled extensions default to the whole registry before prefs load, then honour a disabled entry', () => {
    const registry = [{ id: 'x1' } as unknown as ExtensionDef, { id: 'x2' } as unknown as ExtensionDef];
    vi.mocked(useExtensionCatalog).mockReturnValue({ registry, ready: true });
    render(<App />);
    expect(lastAppChromeProps().enabledExtensions.map((e) => e.id)).toEqual(['x1', 'x2']);

    act(() =>
      lastAppEffectsParams().setPrefs({ extensions: [{ id: 'x1', status: 'disabled' }] } as never),
    );
    expect(lastAppChromeProps().enabledExtensions.map((e) => e.id)).toEqual(['x2']);
  });

  it('contentSnapshot prefers a resize snapshot over the omnibox one', () => {
    vi.mocked(useExtensionSurfaces).mockReturnValue(extSurfacesFixture({ resizeSnapshot: 'resize-data' }));
    render(<App />);
    act(() => lastAppEffectsParams().setOmniboxViewHidden(true));
    act(() => lastAppEffectsParams().setOmniboxSnapshot('omnibox-data'));
    expect(lastAppContentProps().contentSnapshot).toBe('resize-data');
  });

  it('contentSnapshot falls back to the omnibox snapshot only while its view is hidden', () => {
    render(<App />);
    expect(lastAppContentProps().contentSnapshot).toBeNull();

    act(() => lastAppEffectsParams().setOmniboxSnapshot('omnibox-data'));
    expect(lastAppContentProps().contentSnapshot).toBeNull(); // not hidden yet

    act(() => lastAppEffectsParams().setOmniboxViewHidden(true));
    expect(lastAppContentProps().contentSnapshot).toBe('omnibox-data');
  });

  it('opens the command palette from useCommandPalette state and closes it through setOpen(false)', () => {
    const setOpen = vi.fn();
    vi.mocked(useCommandPalette).mockReturnValue({ open: true, setOpen });
    render(<App />);
    const call = vi.mocked(CommandPaletteHost).mock.calls.at(-1)!;
    expect(call[0].open).toBe(true);
    act(() => call[0].onClose());
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
