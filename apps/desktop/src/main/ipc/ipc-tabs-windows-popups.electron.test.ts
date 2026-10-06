import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { ANCHOR, TRUSTED, UNTRUSTED } from './ipc-tabs-windows.test-kit';

/**
 * The window/tabs/popup IPC domain — POPUPS half (`ipc-tabs-windows.ts`). Pinned: the extension-popup
 * capability guard (`popup:open` with `surface: 'ext'` must not open a window for an extension that never
 * declared a `popup` surface — otherwise the manifest's surface list, the whole capability model for
 * extensions, means nothing at the one place it is enforced); per-surface dispatch (widths, keys,
 * optional height, the site-info bubble resolving its own URL from the SENDER window's active tab); and
 * the trust + payload checks each inline listener has to repeat for itself (untrusted frames, malformed
 * payloads, a sender with no window), because these listeners need the sender window and so cannot use
 * the `onAction` helper that would have carried the check for them. Tab and window-chrome behaviour live
 * in `ipc-tabs-windows` / `ipc-tabs-windows-chrome`, which share `ipc-tabs-windows.test-kit`.
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

const { h, libsLogger, tabs, popups, extensions, menus, fire, lastPopup } = kit;

beforeEach(() => {
  kit.reset();
  registerTabsWindowsIpc();
});

describe('popup:open — the extension capability guard', () => {
  it('opens a popup for an extension that declares the popup surface', () => {
    extensions.manifests.set('com.tepegoz.macros', {
      id: 'com.tepegoz.macros',
      surfaces: ['popup', 'page'],
    });

    fire(IpcChannels.popupOpen, TRUSTED, {
      surface: 'ext',
      id: 'com.tepegoz.macros',
      anchor: ANCHOR,
    });

    expect(lastPopup()?.key).toBe('ext:com.tepegoz.macros');
  });

  it('refuses an extension that declares no popup surface', () => {
    // The manifest exists and the id is real — it simply never asked for a popup. Opening one anyway
    // would make the surface list decorative at the only place it is enforced.
    extensions.manifests.set('com.tepegoz.adblock', {
      id: 'com.tepegoz.adblock',
      surfaces: ['page'],
    });

    fire(IpcChannels.popupOpen, TRUSTED, {
      surface: 'ext',
      id: 'com.tepegoz.adblock',
      anchor: ANCHOR,
    });

    expect(popups.opened).toEqual([]);
  });

  it('refuses an extension id that does not exist at all', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'ext', id: 'not.installed', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
  });

  it('refuses an ext popup with no id', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'ext', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
  });
});

describe('popup:open — surface dispatch', () => {
  const widths: [string, number][] = [
    ['main-menu', 300],
    ['user-menu', 320],
    ['notifications', 360],
    ['extensions-panel', 320],
  ];

  it.each(widths)('gives the %s surface its own width', (surface, width) => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface, anchor: ANCHOR });

    expect(lastPopup()?.key).toBe(surface);
    expect(lastPopup()?.width).toBe(width);
  });

  it('keys a bookmark folder dropdown by node, so two folders are two popups', () => {
    fire(IpcChannels.popupOpen, TRUSTED, {
      surface: 'bookmark-folder',
      id: 'node-7',
      anchor: ANCHOR,
    });

    expect(lastPopup()?.key).toBe('bookmark-folder:node-7');
    expect(lastPopup()?.width).toBe(280);
  });

  it('shares ONE key between rename and add-folder, so the dialog replaces itself', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'bookmark-rename', id: 'n-1', anchor: ANCHOR });
    fire(IpcChannels.popupOpen, TRUSTED, {
      surface: 'bookmark-add-folder',
      id: 'n-2',
      anchor: ANCHOR,
    });

    expect(popups.opened.map((p) => p.key)).toEqual(['bookmark-dialog', 'bookmark-dialog']);
  });

  it('omits height entirely when the renderer measured none', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'main-menu', anchor: ANCHOR });

    // `exactOptionalPropertyTypes`: an explicit `height: undefined` is a different thing from absent,
    // and the popup manager reads "absent" as "compute it yourself".
    expect(lastPopup()).not.toHaveProperty('height');
  });

  it('passes a measured height through', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'main-menu', anchor: ANCHOR, height: 480 });

    expect(lastPopup()?.height).toBe(480);
  });

  it('ignores a surface it does not know', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'not-a-surface', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
  });
});

describe('the checks each inline listener has to repeat for itself', () => {
  it('drops popup:open from an untrusted frame', () => {
    fire(IpcChannels.popupOpen, UNTRUSTED, { surface: 'main-menu', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
  });

  it('drops a malformed popup:open payload', () => {
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'main-menu' });

    expect(popups.opened).toEqual([]);
  });

  it('drops popup:open when the sender has no window', () => {
    h.window = null;
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'main-menu', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
  });

  it('drops popup:resize from an untrusted frame, and honours a trusted one', () => {
    fire(IpcChannels.popupResize, UNTRUSTED, { height: 300 });
    expect(popups.resized).toEqual([]);

    fire(IpcChannels.popupResize, TRUSTED, { height: 300 });
    expect(popups.resized).toEqual([300]);
  });

  it('drops a malformed popup:resize payload', () => {
    fire(IpcChannels.popupResize, TRUSTED, { height: -1 });

    expect(popups.resized).toEqual([]);
  });

  it('drops a tab context menu request from an untrusted frame', () => {
    fire(IpcChannels.tabsContextMenu, UNTRUSTED, { tabId: 't-1', x: 0, y: 0 });

    expect(menus.tab).not.toHaveBeenCalled();
  });

  it('drops a submenu request from an untrusted frame', () => {
    fire(IpcChannels.submenuOpen, UNTRUSTED, { kind: 'bookmarks', anchor: ANCHOR, height: 200 });

    expect(popups.submenus).toEqual([]);
  });
});

describe('popup:open — the site-info bubble resolves its own URL', () => {
  it('opens the bubble with the SENDER window active tab URL and start alignment', () => {
    tabs.api.getState.mockReturnValueOnce({
      tabs: [{ id: 't-1', url: 'https://site.example/page' }],
      groups: [],
      activeId: 't-1',
      canGoBack: false,
      canGoForward: false,
    });

    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'site-info', anchor: ANCHOR });

    expect(lastPopup()).toMatchObject({
      key: 'site-info',
      width: 360,
      align: 'start',
      query: { surface: 'site-info', url: 'https://site.example/page' },
    });
  });

  it('honours an explicit align over the start default', () => {
    tabs.api.getState.mockReturnValueOnce({
      tabs: [{ id: 't-1', url: 'https://site.example/' }],
      groups: [],
      activeId: 't-1',
      canGoBack: false,
      canGoForward: false,
    });

    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'site-info', anchor: ANCHOR, align: 'end' });

    expect(lastPopup()?.align).toBe('end');
  });

  it('refuses when the active tab has no URL', () => {
    // The default getState mock returns a tab with no `url`.
    fire(IpcChannels.popupOpen, TRUSTED, { surface: 'site-info', anchor: ANCHOR });

    expect(popups.opened).toEqual([]);
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored popup:open site-info: no active tab URL');
  });
});

describe('popup:open — a measured height passes through every keyed surface', () => {
  const keyed: [string, string | undefined, number][] = [
    ['user-menu', undefined, 500],
    ['notifications', undefined, 500],
    ['extensions-panel', undefined, 500],
    ['bookmark-folder', 'node-3', 500],
    ['bookmark-rename', 'node-4', 500],
  ];

  it.each(keyed)('passes height through for %s', (surface, id, height) => {
    fire(IpcChannels.popupOpen, TRUSTED, {
      surface,
      anchor: ANCHOR,
      height,
      ...(id !== undefined ? { id } : {}),
    });

    expect(lastPopup()?.height).toBe(height);
  });
});
