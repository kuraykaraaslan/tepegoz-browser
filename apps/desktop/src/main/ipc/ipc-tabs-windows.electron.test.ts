import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { TRUSTED, UNTRUSTED } from './ipc-tabs-windows.test-kit';

/**
 * The window/tabs/popup IPC domain — TABS half (`ipc-tabs-windows.ts`). Pinned: per-window routing
 * (content bounds and visibility are per-window; routing them through the FOCUSED window instead of the
 * SENDER would misplace a background window's view, and look completely correct in any single-window
 * test), degraded reads (`tabs:get-state` for a sender with no tab manager answers an empty state rather
 * than throwing, since the renderer calls it during teardown), tab-group updates apply only the keys that
 * were sent, and every window-scoped tab action delegates to the sender window and ignores untrusted
 * frames. Popups and window chrome live in `ipc-tabs-windows-popups` / `ipc-tabs-windows-chrome`, which
 * share `ipc-tabs-windows.test-kit`.
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

const { h, libsLogger, tabs, senderWindow, fire, call } = kit;

beforeEach(() => {
  kit.reset();
  registerTabsWindowsIpc();
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
