import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The window/tabs/popup IPC domain — 397 lines that had never executed.
 *
 * Most of the file is delegation, and delegation is not what this tests. What it tests is the four
 * places where the file DECIDES something, each of which fails silently when wrong:
 *
 *  1. The extension-popup capability guard. `popup:open` with `surface: 'ext'` opens a native window
 *     for an extension id supplied by the renderer. An extension that never declared a `popup` surface
 *     must not get one — otherwise the manifest's surface list, which is the whole capability model for
 *     extensions, means nothing at the one place it is enforced.
 *  2. Per-window routing. Content bounds and visibility are per-window; routing them through the
 *     FOCUSED window instead of the SENDER would misplace a background window's view, and would look
 *     completely correct in any single-window test or single-window session.
 *  3. Quit ordering. `markQuitting()` must run BEFORE `app.quit()`, because the close-to-tray
 *     interceptor stands down on that flag. Reversed, a real quit gets swallowed into the tray.
 *  4. Degraded reads. `tabs:get-state` for a sender with no tab manager must answer an empty state
 *     rather than throw, since the renderer calls it during teardown.
 *
 * Everything below the fold — untrusted frames, malformed payloads — is asserted per entry point
 * rather than once, because each of these listeners re-implements the check inline (they need the
 * sender window, so they cannot use the `onAction` helper that would have carried it for them).
 */

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Harness {
  listeners: Map<string, (event: unknown, payload: unknown) => void>;
  handlers: Map<string, (event: unknown, payload: unknown) => unknown>;
  window: unknown;
  quits: number;
  markQuittingAt: number[];
  quitAt: number[];
  clock: number;
}

const h = vi.hoisted((): Harness => ({
  listeners: new Map(),
  handlers: new Map(),
  window: null,
  quits: 0,
  markQuittingAt: [],
  quitAt: [],
  clock: 0,
}));

const relaunches = vi.hoisted(() => ({ count: 0 }));

vi.mock('electron', () => ({
  app: {
    quit: () => {
      h.clock += 1;
      h.quitAt.push(h.clock);
      h.quits += 1;
    },
    relaunch: () => {
      relaunches.count += 1;
    },
    isPackaged: false,
    getLocale: () => 'en',
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      h.handlers.set(channel, fn);
    },
    on: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
      h.listeners.set(channel, fn);
    },
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => h.window },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
const UNTRUSTED = 'https://evil.example/pwn';

vi.mock('../lib/trusted-origin', () => ({
  isTrustedAppUrl: (url: string) => url === 'app://tepegoz/chrome.html',
}));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { badRequest: 'bad', forbidden: 'forbidden' } }),
}));

const libsLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  redact: (s: string) => s,
}));
vi.mock('@tepegoz/libs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, Logger: libsLogger };
});

/** The tab manager the sender window resolves to, and the three lookup paths that can reach it. */
const tabs = vi.hoisted(() => ({
  api: {
    navigateActive: vi.fn(),
    setContentBounds: vi.fn(),
    setContentVisible: vi.fn(),
    captureActive: vi.fn(() => Promise.resolve('data:image/png;base64,AAA')),
    getState: vi.fn<() => Record<string, unknown>>(() => ({
      tabs: [{ id: 't-1' }],
      groups: [],
      activeId: 't-1',
      canGoBack: true,
      canGoForward: false,
    })),
    renameGroup: vi.fn(),
    recolorGroup: vi.fn(),
    setGroupCollapsed: vi.fn(),
    updateGroupSettings: vi.fn(),
    hideTab: vi.fn(),
    showTab: vi.fn(),
    unhideTab: vi.fn(),
    createTab: vi.fn(),
    closeTab: vi.fn(),
    activate: vi.fn(),
    moveTab: vi.fn(),
    setPinned: vi.fn(),
    createGroup: vi.fn(),
    moveGroup: vi.fn(),
    assignToGroup: vi.fn(),
    removeFromGroup: vi.fn(),
    ungroup: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reloadActive: vi.fn(),
    goHome: vi.fn(),
    reopenClosedTab: vi.fn(),
  },
  /** `undefined` models "this window has no tab manager" — the teardown case. All three lookups
   *  return `WindowTabs | undefined` (`tabs-manager-base.ts`), and the group-update path checks
   *  `=== undefined` explicitly rather than optional-chaining, so the distinction is load-bearing. */
  resolve: undefined as Record<string, unknown> | undefined,
  /** The three lookup paths, asserted on directly rather than through the imported class: which one a
   *  handler picks is the difference between routing to the SENDER window and to the focused one. */
  forWindow: vi.fn(),
  forSenderWindow: vi.fn(),
  forSender: vi.fn(),
}));

vi.mock('../tabs', () => ({
  default: {
    forWindow: (win: unknown) => {
      tabs.forWindow(win);
      return tabs.resolve;
    },
    forSenderWindow: (win: unknown) => {
      tabs.forSenderWindow(win);
      return tabs.resolve;
    },
    forSender: (wc: unknown) => {
      tabs.forSender(wc);
      return tabs.resolve;
    },
  },
}));

const popups = vi.hoisted(() => ({
  opened: [] as Record<string, unknown>[],
  submenus: [] as Record<string, unknown>[],
  resized: [] as number[],
  closed: 0,
  closedSub: 0,
}));

vi.mock('../popup-window', () => ({
  default: {
    open: (options: Record<string, unknown>) => popups.opened.push(options),
    openSubmenu: (options: Record<string, unknown>) => popups.submenus.push(options),
    resize: (_win: unknown, height: number) => popups.resized.push(height),
    close: () => {
      popups.closed += 1;
    },
    closeSub: () => {
      popups.closedSub += 1;
    },
  },
}));

const recovery = vi.hoisted(() => ({ undo: vi.fn() }));
vi.mock('../recovery/session-restore-undo', () => ({ undoSessionRestore: recovery.undo }));

const extensions = vi.hoisted(() => ({
  manifests: new Map<string, { id: string; surfaces: string[] }>(),
}));

vi.mock('../../shared/extensions', () => ({
  manifestById: (id: string) => extensions.manifests.get(id),
}));

const quit = vi.hoisted(() => ({ marks: 0 }));

vi.mock('../quit-state', () => ({
  markQuitting: () => {
    h.clock += 1;
    h.markQuittingAt.push(h.clock);
    quit.marks += 1;
  },
}));

const menus = vi.hoisted(() => ({
  tab: vi.fn(),
  hidden: vi.fn(),
  navHistory: vi.fn(),
  bookmark: vi.fn(),
  extension: vi.fn(),
  group: vi.fn(),
  pageAction: vi.fn(),
  pageContribAction: vi.fn(),
}));

vi.mock('../menus/tab-context-menu', () => ({ showTabContextMenu: menus.tab }));
vi.mock('../menus/hidden-tabs-menu', () => ({ showHiddenTabsMenu: menus.hidden }));
vi.mock('../menus/nav-history-menu', () => ({ showNavHistoryMenu: menus.navHistory }));
vi.mock('../menus/bookmark-context-menu', () => ({ showBookmarkContextMenu: menus.bookmark }));
vi.mock('../menus/extension-context-menu', () => ({ showExtensionContextMenu: menus.extension }));
vi.mock('../menus/tab-group-context-menu', () => ({ showGroupContextMenu: menus.group }));
vi.mock('../menus/page-context-menu', () => ({
  getPageMenuContext: () => ({ hasSelection: false }),
  runPageMenuAction: menus.pageAction,
  runPageMenuContributionAction: menus.pageContribAction,
}));
vi.mock('../lib/chrome-window', () => ({
  chromeWindowFor: () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }),
}));

const { registerTabsWindowsIpc } = await import('./ipc-tabs-windows');

const ANCHOR: Anchor = { x: 10, y: 20, width: 30, height: 40 };
const senderWindow = {
  id: 1,
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
};

function event(url: string) {
  return { senderFrame: { url }, sender: { id: 99 } };
}

function fire(channel: string, url: string, payload?: unknown): void {
  h.listeners.get(channel)?.(event(url), payload);
}

async function call(channel: string, url: string, payload?: unknown): Promise<unknown> {
  const fn = h.handlers.get(channel);
  if (fn === undefined) throw new Error(`no handler for ${channel}`);
  return await fn(event(url), payload);
}

/** The most recent `PopupWindowManager.open` options, or undefined if it was never called. */
function lastPopup(): Record<string, unknown> | undefined {
  return popups.opened.at(-1);
}

beforeEach(() => {
  h.listeners.clear();
  h.handlers.clear();
  h.window = senderWindow;
  h.clock = 0;
  h.markQuittingAt.length = 0;
  h.quitAt.length = 0;
  h.quits = 0;
  quit.marks = 0;
  popups.opened.length = 0;
  popups.submenus.length = 0;
  popups.resized.length = 0;
  popups.closed = 0;
  popups.closedSub = 0;
  relaunches.count = 0;
  extensions.manifests.clear();
  tabs.resolve = tabs.api;
  vi.clearAllMocks();
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

describe('per-window routing', () => {
  it('routes content bounds to the SENDER window, not the focused one', () => {
    fire(IpcChannels.tabsSetBounds, TRUSTED, { x: 0, y: 88, width: 1200, height: 700 });

    expect(tabs.forWindow).toHaveBeenCalledWith(senderWindow);
    expect(tabs.api.setContentBounds).toHaveBeenCalledWith({
      x: 0,
      y: 88,
      width: 1200,
      height: 700,
    });
  });

  it('drops content bounds when the sender resolves to no window', () => {
    h.window = null;

    fire(IpcChannels.tabsSetBounds, TRUSTED, { x: 0, y: 88, width: 1200, height: 700 });

    expect(tabs.api.setContentBounds).not.toHaveBeenCalled();
  });

  it('survives a window that has no tab manager', () => {
    tabs.resolve = undefined;

    expect(() => {
      fire(IpcChannels.tabsSetContentVisible, TRUSTED, { visible: false });
    }).not.toThrow();
  });
});

describe('tabs:get-state', () => {
  it('returns the live state for a sender that has one', async () => {
    await expect(call(IpcChannels.tabsGetState, TRUSTED)).resolves.toMatchObject({
      activeId: 't-1',
      canGoBack: true,
    });
  });

  it('answers an EMPTY state rather than throwing when there is no tab manager', async () => {
    // The renderer polls this during teardown, when the manager may already be gone. Throwing here
    // surfaces as a boundary error in a window that is closing anyway.
    tabs.resolve = undefined;

    await expect(call(IpcChannels.tabsGetState, TRUSTED)).resolves.toEqual({
      tabs: [],
      groups: [],
      activeId: null,
      canGoBack: false,
      canGoForward: false,
      isPrivate: false,
      activeZoomFactor: 1,
      activeSecurityLevel: 'unknown',
    });
  });

  it('refuses an untrusted caller', async () => {
    await expect(call(IpcChannels.tabsGetState, UNTRUSTED)).rejects.toThrow('[403]');
  });
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

describe('tab-group update — only what was sent', () => {
  it('applies a rename without touching colour, collapse or settings', () => {
    fire(IpcChannels.tabsGroupUpdate, TRUSTED, { groupId: 'g-1', name: 'Research' });

    expect(tabs.api.renameGroup).toHaveBeenCalledWith('g-1', 'Research');
    expect(tabs.api.recolorGroup).not.toHaveBeenCalled();
    expect(tabs.api.setGroupCollapsed).not.toHaveBeenCalled();
    expect(tabs.api.updateGroupSettings).not.toHaveBeenCalled();
  });

  it('applies a collapse of FALSE, which an "if (collapsed)" check would swallow', () => {
    fire(IpcChannels.tabsGroupUpdate, TRUSTED, { groupId: 'g-1', collapsed: false });

    expect(tabs.api.setGroupCollapsed).toHaveBeenCalledWith('g-1', false);
  });

  it('does nothing at all when the window has no tab manager', () => {
    tabs.resolve = undefined;

    expect(() => {
      fire(IpcChannels.tabsGroupUpdate, TRUSTED, { groupId: 'g-1', name: 'Research' });
    }).not.toThrow();
  });
});

describe('the window-scoped tab actions delegate to the sender window', () => {
  it('routes create / background-create / close / activate', () => {
    fire(IpcChannels.tabsCreate, TRUSTED, 'https://a.test/');
    expect(tabs.api.createTab).toHaveBeenCalledWith('https://a.test/');

    fire(IpcChannels.tabsCreateBackground, TRUSTED, 'https://b.test/');
    expect(tabs.api.createTab).toHaveBeenCalledWith('https://b.test/', { background: true });

    fire(IpcChannels.tabsClose, TRUSTED, 't-9');
    expect(tabs.api.closeTab).toHaveBeenCalledWith('t-9');

    fire(IpcChannels.tabsActivate, TRUSTED, 't-9');
    expect(tabs.api.activate).toHaveBeenCalledWith('t-9');
  });

  it('routes move / pin / set-hidden (both directions)', () => {
    fire(IpcChannels.tabsMove, TRUSTED, { id: 't-1', toIndex: 2, intoGroupId: 'g-1' });
    expect(tabs.api.moveTab).toHaveBeenCalledWith('t-1', 2, 'g-1');

    fire(IpcChannels.tabsPin, TRUSTED, { id: 't-1', pinned: true });
    expect(tabs.api.setPinned).toHaveBeenCalledWith('t-1', true);

    fire(IpcChannels.tabsSetHidden, TRUSTED, { id: 't-1', hidden: true });
    expect(tabs.api.hideTab).toHaveBeenCalledWith('t-1');

    fire(IpcChannels.tabsSetHidden, TRUSTED, { id: 't-1', hidden: false });
    expect(tabs.api.unhideTab).toHaveBeenCalledWith('t-1');
  });

  it('routes the group lifecycle actions', () => {
    fire(IpcChannels.tabsGroupCreate, TRUSTED, { memberIds: ['t-1', 't-2'] });
    expect(tabs.api.createGroup).toHaveBeenCalledWith(['t-1', 't-2']);

    fire(IpcChannels.tabsGroupMove, TRUSTED, { groupId: 'g-1', toIndex: 0 });
    expect(tabs.api.moveGroup).toHaveBeenCalledWith('g-1', 0);

    fire(IpcChannels.tabsGroupAssign, TRUSTED, { tabId: 't-1', groupId: 'g-1' });
    expect(tabs.api.assignToGroup).toHaveBeenCalledWith('t-1', 'g-1');

    fire(IpcChannels.tabsGroupRemove, TRUSTED, 't-1');
    expect(tabs.api.removeFromGroup).toHaveBeenCalledWith('t-1');

    fire(IpcChannels.tabsUngroup, TRUSTED, 'g-1');
    expect(tabs.api.ungroup).toHaveBeenCalledWith('g-1');
  });

  it('routes navigate + the four history/reload signals + reopen-closed', () => {
    fire(IpcChannels.tabsNavigate, TRUSTED, 'https://go.test/');
    expect(tabs.api.navigateActive).toHaveBeenCalledWith('https://go.test/');

    fire(IpcChannels.tabsGoBack, TRUSTED);
    fire(IpcChannels.tabsGoForward, TRUSTED);
    fire(IpcChannels.tabsReload, TRUSTED);
    fire(IpcChannels.tabsHome, TRUSTED);
    expect(tabs.api.goBack).toHaveBeenCalled();
    expect(tabs.api.goForward).toHaveBeenCalled();
    expect(tabs.api.reloadActive).toHaveBeenCalled();
    expect(tabs.api.goHome).toHaveBeenCalled();

    fire(IpcChannels.tabsReopenClosed, TRUSTED, { id: 'closed-1' });
    expect(tabs.api.reopenClosedTab).toHaveBeenCalledWith('closed-1');
  });

  it('drops a malformed tab-move payload with a warning instead of delegating', () => {
    fire(IpcChannels.tabsMove, TRUSTED, { id: 't-1' }); // no toIndex
    expect(tabs.api.moveTab).not.toHaveBeenCalled();
    expect(libsLogger.warn).toHaveBeenCalled();
  });

  it('ignores every window action from an untrusted frame', () => {
    fire(IpcChannels.tabsCreate, UNTRUSTED, 'https://evil/');
    fire(IpcChannels.tabsClose, UNTRUSTED, 't-1');
    fire(IpcChannels.tabsGoBack, UNTRUSTED);
    expect(tabs.api.createTab).not.toHaveBeenCalled();
    expect(tabs.api.closeTab).not.toHaveBeenCalled();
    expect(tabs.api.goBack).not.toHaveBeenCalled();
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

describe('tab-group update — colour and settings patches', () => {
  it('recolours and merges settings when only those keys are sent', () => {
    fire(IpcChannels.tabsGroupUpdate, TRUSTED, {
      groupId: 'g-1',
      color: 'blue',
      settings: { agent: true },
    });

    expect(tabs.api.recolorGroup).toHaveBeenCalledWith('g-1', 'blue');
    expect(tabs.api.updateGroupSettings).toHaveBeenCalledWith('g-1', { agent: true });
    expect(tabs.api.renameGroup).not.toHaveBeenCalled();
    expect(tabs.api.setGroupCollapsed).not.toHaveBeenCalled();
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
    expect(libsLogger.warn).toHaveBeenCalledWith('Ignored tabs:group-context-menu: invalid payload');

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
