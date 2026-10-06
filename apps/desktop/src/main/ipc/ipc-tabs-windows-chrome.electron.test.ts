import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { ANCHOR, TRUSTED, UNTRUSTED } from './ipc-tabs-windows.test-kit';

/**
 * The window/tabs/popup IPC domain — WINDOW CHROME half (`ipc-tabs-windows.ts`). Pinned: quit ordering
 * (`markQuitting()` must run BEFORE `app.quit()`, because the close-to-tray interceptor stands down on
 * that flag — reversed, a real quit gets swallowed into the tray), relaunch, native window controls,
 * the native context menus anchoring on the sender window, the extension open-request relay, submenu
 * signals, the remaining delegators, and the trust + payload checks every inline menu listener repeats
 * for itself. Tabs and popups live in `ipc-tabs-windows` / `ipc-tabs-windows-popups`, which share
 * `ipc-tabs-windows.test-kit`.
 */

const kit = await vi.hoisted(async () =>
  (await import('./ipc-tabs-windows.test-kit')).createTabsWindowsHarness(),
);

vi.mock('electron', () => kit.electronMock);
vi.mock('../lib/trusted-origin', () => ({
  isTrustedAppUrl: (url: string) => url === 'app://tepegoz/chrome.html',
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { badRequest: 'bad', forbidden: 'forbidden' } }),
}));
vi.mock('@tepegoz/libs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, Logger: kit.libsLogger };
});
vi.mock('../tabs', () => kit.tabsModule);
vi.mock('../popup-window', () => kit.popupModule);
vi.mock('../recovery/session-restore-undo', () => ({ undoSessionRestore: kit.recovery.undo }));
vi.mock('../../shared/extensions', () => ({
  manifestById: (id: string) => kit.extensions.manifests.get(id),
}));
vi.mock('../quit-state', () => kit.quitStateModule);
vi.mock('../menus/tab-context-menu', () => ({ showTabContextMenu: kit.menus.tab }));
vi.mock('../menus/hidden-tabs-menu', () => ({ showHiddenTabsMenu: kit.menus.hidden }));
vi.mock('../menus/nav-history-menu', () => ({ showNavHistoryMenu: kit.menus.navHistory }));
vi.mock('../menus/bookmark-context-menu', () => ({ showBookmarkContextMenu: kit.menus.bookmark }));
vi.mock('../menus/extension-context-menu', () => ({
  showExtensionContextMenu: kit.menus.extension,
}));
vi.mock('../menus/tab-group-context-menu', () => ({ showGroupContextMenu: kit.menus.group }));
vi.mock('../menus/page-context-menu', () => ({
  getPageMenuContext: () => ({ hasSelection: false }),
  runPageMenuAction: kit.menus.pageAction,
  runPageMenuContributionAction: kit.menus.pageContribAction,
}));
vi.mock('../lib/chrome-window', () => ({
  chromeWindowFor: () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }),
}));

const { registerTabsWindowsIpc } = await import('./ipc-tabs-windows');

const {
  h,
  relaunches,
  libsLogger,
  tabs,
  popups,
  recovery,
  extensions,
  quit,
  menus,
  senderWindow,
  fire,
  call,
} = kit;

beforeEach(() => {
  kit.reset();
  registerTabsWindowsIpc();
});

describe('app:quit ordering', () => {
  it('marks quitting BEFORE quitting, so the close-to-tray interceptor stands down', () => {
    fire(IpcChannels.appQuit, TRUSTED);

    expect(quit.marks).toBe(1);
    expect(h.quits).toBe(1);
    // Reversed, a real quit is swallowed into the tray and the app never exits.
    expect(h.markQuittingAt[0]).toBeLessThan(h.quitAt[0] ?? 0);
  });

  it('does not quit for an untrusted frame', () => {
    fire(IpcChannels.appQuit, UNTRUSTED);

    expect(h.quits).toBe(0);
    expect(quit.marks).toBe(0);
  });
});

describe('native context menus anchor on the sender window', () => {
  it('opens the tab / hidden-tabs / nav-history / group menus', () => {
    fire(IpcChannels.tabsContextMenu, TRUSTED, 't-1');
    expect(menus.tab).toHaveBeenCalledWith(senderWindow, 't-1');

    fire(IpcChannels.tabsHiddenMenu, TRUSTED);
    expect(menus.hidden).toHaveBeenCalledWith(senderWindow);

    fire(IpcChannels.tabsHistoryMenu, TRUSTED, 'back');
    expect(menus.navHistory).toHaveBeenCalledWith(senderWindow, 'back');

    fire(IpcChannels.tabsGroupContextMenu, TRUSTED, 'g-1');
    expect(menus.group).toHaveBeenCalledWith(senderWindow, 'g-1');
  });

  it('opens the bookmark + extension menus with the parsed payload', () => {
    fire(IpcChannels.bookmarksContextMenu, TRUSTED, {
      id: 'bm-1',
      type: 'bookmark',
      variant: 'default',
    });
    expect(menus.bookmark).toHaveBeenCalledWith(senderWindow, 'bm-1', 'bookmark', 'default');

    fire(IpcChannels.extensionContextMenu, TRUSTED, 'com.tepegoz.macros');
    expect(menus.extension).toHaveBeenCalledWith(senderWindow, 'com.tepegoz.macros');
  });

  it('drops a malformed context-menu payload with a warning', () => {
    fire(IpcChannels.tabsContextMenu, TRUSTED, { not: 'a tab id' });
    expect(menus.tab).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored tabs:context-menu: invalid payload');
  });

  it('ignores context-menu requests from an untrusted frame', () => {
    fire(IpcChannels.tabsContextMenu, UNTRUSTED, 't-1');
    fire(IpcChannels.bookmarksContextMenu, UNTRUSTED, { id: 'x', type: 'folder' });
    expect(menus.tab).not.toHaveBeenCalled();
    expect(menus.bookmark).not.toHaveBeenCalled();
  });
});

describe('extension:open-request relays to the owning chrome window', () => {
  it('closes the panel and forwards the id for a known extension', () => {
    extensions.manifests.set('com.tepegoz.macros', {
      id: 'com.tepegoz.macros',
      surfaces: ['popup'],
    });
    fire(IpcChannels.extensionOpenRequest, TRUSTED, 'com.tepegoz.macros');
    expect(popups.closed).toBe(1);
  });

  it('ignores an open-request for an unknown extension', () => {
    fire(IpcChannels.extensionOpenRequest, TRUSTED, 'com.unknown.ext');
    expect(popups.closed).toBe(0);
    expect(libsLogger.warn).toHaveBeenCalledWith(
      'Ignored extension:open-request for an unknown extension',
      { id: 'com.unknown.ext' },
    );
  });
});

describe('submenu + quit signals', () => {
  it('submenu:open attaches a flyout for the parsed kind', () => {
    fire(IpcChannels.submenuOpen, TRUSTED, { kind: 'history', anchor: ANCHOR });
    expect(popups.submenus.at(-1)).toMatchObject({
      query: { surface: 'menu-sub', kind: 'history' },
    });
  });

  it('app:quit marks quitting BEFORE it calls app.quit()', () => {
    fire(IpcChannels.appQuit, TRUSTED);
    expect(quit.marks).toBe(1);
    expect(h.quits).toBe(1);
    expect(Math.min(...h.markQuittingAt)).toBeLessThan(Math.min(...h.quitAt));
  });
});

describe('native window chrome controls', () => {
  it('minimises / closes the sender window', () => {
    fire(IpcChannels.windowMinimize, TRUSTED);
    expect(senderWindow.minimize).toHaveBeenCalledTimes(1);

    fire(IpcChannels.windowClose, TRUSTED);
    expect(senderWindow.close).toHaveBeenCalledTimes(1);
  });

  it('toggles maximize both ways off the window state', () => {
    senderWindow.isMaximized.mockReturnValue(false);
    fire(IpcChannels.windowMaximizeToggle, TRUSTED);
    expect(senderWindow.maximize).toHaveBeenCalledTimes(1);
    expect(senderWindow.unmaximize).not.toHaveBeenCalled();

    senderWindow.isMaximized.mockReturnValue(true);
    fire(IpcChannels.windowMaximizeToggle, TRUSTED);
    expect(senderWindow.unmaximize).toHaveBeenCalledTimes(1);
    senderWindow.isMaximized.mockReturnValue(false);
  });

  it('ignores a window control from an untrusted frame', () => {
    fire(IpcChannels.windowMinimize, UNTRUSTED);
    expect(senderWindow.minimize).not.toHaveBeenCalled();
  });

  it('window:is-maximized reports the window state, and false when there is no window', async () => {
    senderWindow.isMaximized.mockReturnValue(true);
    await expect(call(IpcChannels.windowIsMaximized, TRUSTED)).resolves.toBe(true);
    senderWindow.isMaximized.mockReturnValue(false);

    h.window = null;
    await expect(call(IpcChannels.windowIsMaximized, TRUSTED)).resolves.toBe(false);
  });
});

describe('the remaining signals + delegators', () => {
  it('popup:close and submenu:close reach the popup manager', () => {
    fire(IpcChannels.popupClose, TRUSTED);
    expect(popups.closed).toBe(1);

    fire(IpcChannels.submenuClose, TRUSTED);
    expect(popups.closedSub).toBe(1);
  });

  it('app:relaunch marks quitting, queues the relaunch, then quits', () => {
    fire(IpcChannels.appRelaunch, TRUSTED);

    expect(quit.marks).toBe(1);
    expect(relaunches.count).toBe(1);
    expect(h.quits).toBe(1);
    expect(Math.min(...h.markQuittingAt)).toBeLessThan(Math.min(...h.quitAt));
  });

  it('does not relaunch for an untrusted frame', () => {
    fire(IpcChannels.appRelaunch, UNTRUSTED);
    expect(relaunches.count).toBe(0);
    expect(h.quits).toBe(0);
  });

  it('session:undo-restore delegates to undoSessionRestore', () => {
    fire(IpcChannels.sessionUndoRestore, TRUSTED);
    expect(recovery.undo).toHaveBeenCalledTimes(1);
  });

  it('page-menu action + contribution-action dispatch the parsed payload', () => {
    fire(IpcChannels.pageMenuAction, TRUSTED, 'reload');
    expect(menus.pageAction).toHaveBeenCalledWith('reload');

    fire(IpcChannels.pageMenuContributionAction, TRUSTED, {
      menuId: 'm-1',
      contributorId: 'c-1',
      sectionId: 's-1',
      itemId: 'i-1',
      actionId: 'a-1',
    });
    expect(menus.pageContribAction).toHaveBeenCalledWith(
      expect.objectContaining({ menuId: 'm-1', actionId: 'a-1' }),
    );
  });

  it('tabs:set-content-visible routes the boolean to the sender window', () => {
    fire(IpcChannels.tabsSetContentVisible, TRUSTED, true);
    expect(tabs.api.setContentVisible).toHaveBeenCalledWith(true);
  });

  it('tabs:capture returns the active view capture, or null with no tab manager', async () => {
    await expect(call(IpcChannels.tabsCapture, TRUSTED)).resolves.toBe('data:image/png;base64,AAA');

    tabs.resolve = undefined;
    await expect(call(IpcChannels.tabsCapture, TRUSTED)).resolves.toBeNull();
  });
});

describe('every inline menu listener repeats the trust + payload checks', () => {
  it('drops a malformed history / bookmark / extension / group-context payload with its own warning', () => {
    fire(IpcChannels.tabsHistoryMenu, TRUSTED, 'sideways');
    expect(menus.navHistory).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored tabs:history-menu: invalid payload');

    fire(IpcChannels.bookmarksContextMenu, TRUSTED, 123);
    expect(menus.bookmark).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored bookmarks:context-menu: invalid payload');

    fire(IpcChannels.extensionContextMenu, TRUSTED, {});
    expect(menus.extension).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored extension:context-menu: invalid payload');

    fire(IpcChannels.tabsGroupContextMenu, TRUSTED, {});
    expect(menus.group).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalledWith(
      'Ignored tabs:group-context-menu: invalid payload',
    );

    fire(IpcChannels.submenuOpen, TRUSTED, { kind: 'history' });
    expect(popups.submenus).toEqual([]);
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored submenu:open: invalid payload');
  });

  it('drops the hidden-tabs / history / bookmark / extension / group menus from an untrusted frame', () => {
    fire(IpcChannels.tabsHiddenMenu, UNTRUSTED);
    fire(IpcChannels.tabsHistoryMenu, UNTRUSTED, 'back');
    fire(IpcChannels.bookmarksContextMenu, UNTRUSTED, { id: 'b', type: 'bookmark' });
    fire(IpcChannels.extensionContextMenu, UNTRUSTED, 'com.tepegoz.macros');
    fire(IpcChannels.tabsGroupContextMenu, UNTRUSTED, 'g-1');

    expect(menus.hidden).not.toHaveBeenCalled();
    expect(menus.navHistory).not.toHaveBeenCalled();
    expect(menus.bookmark).not.toHaveBeenCalled();
    expect(menus.extension).not.toHaveBeenCalled();
    expect(menus.group).not.toHaveBeenCalled();
  });

  it('drops popup:resize when the sender resolves to no window', () => {
    h.window = null;
    fire(IpcChannels.popupResize, TRUSTED, { height: 300 });
    expect(popups.resized).toEqual([]);
  });
});
