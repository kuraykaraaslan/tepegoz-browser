import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The window + tab + tab-group + drag + popup + page-menu slice of the preload bridge (~60 methods,
 * one shape). Data-driven pin of channel + payload for the bulk, plus the two methods that carry real
 * logic: `reopenClosedTab` ({} vs {id}) and `onActiveGroupChange` (derives the active group from tab
 * state and only fires the callback on a CHANGE).
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve({})),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { windowTabsApi: api } = await import('./api-window-tabs');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue({});
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

type Row = [name: string, run: () => unknown, channel: string, payload?: unknown];

const SENDS: Row[] = [
  ['minimizeWindow', () => api.minimizeWindow(), IpcChannels.windowMinimize],
  ['toggleMaximizeWindow', () => api.toggleMaximizeWindow(), IpcChannels.windowMaximizeToggle],
  ['closeWindow', () => api.closeWindow(), IpcChannels.windowClose],
  ['newWindow', () => api.newWindow(), IpcChannels.windowNew],
  ['tabGoBack', () => api.tabGoBack(), IpcChannels.tabsGoBack],
  ['tabReload', () => api.tabReload(), IpcChannels.tabsReload],
  ['undoSessionRestore', () => api.undoSessionRestore(), IpcChannels.sessionUndoRestore],
  ['stopFindInPage', () => api.stopFindInPage(), IpcChannels.findStop],
  ['cancelTabDrag', () => api.cancelTabDrag(), IpcChannels.tabsDragCancel],
  ['quitApp', () => api.quitApp(), IpcChannels.appQuit],
  ['relaunchApp', () => api.relaunchApp(), IpcChannels.appRelaunch],
  ['createTab', () => api.createTab('https://x.test/'), IpcChannels.tabsCreate, 'https://x.test/'],
  ['closeTab', () => api.closeTab('t1'), IpcChannels.tabsClose, 't1'],
  ['activateTab', () => api.activateTab('t1'), IpcChannels.tabsActivate, 't1'],
  ['navigateTab', () => api.navigateTab('example.com'), IpcChannels.tabsNavigate, 'example.com'],
  ['ungroupTabGroup', () => api.ungroupTabGroup('g1'), IpcChannels.tabsUngroup, 'g1'],
  ['pageMenuAction', () => api.pageMenuAction('copy'), IpcChannels.pageMenuAction, 'copy'],
  [
    'moveTab',
    () => api.moveTab('t1', 3, 'g1'),
    IpcChannels.tabsMove,
    { id: 't1', toIndex: 3, intoGroupId: 'g1' },
  ],
  [
    'setTabPinned',
    () => api.setTabPinned('t1', true),
    IpcChannels.tabsPin,
    { id: 't1', pinned: true },
  ],
  [
    'setTabHidden',
    () => api.setTabHidden('t1', false),
    IpcChannels.tabsSetHidden,
    { id: 't1', hidden: false },
  ],
  [
    'assignTabToGroup',
    () => api.assignTabToGroup('t1', 'g1'),
    IpcChannels.tabsGroupAssign,
    { tabId: 't1', groupId: 'g1' },
  ],
  [
    'updateTabGroup',
    () => api.updateTabGroup('g1', { name: 'X', collapsed: true }),
    IpcChannels.tabsGroupUpdate,
    { groupId: 'g1', name: 'X', collapsed: true },
  ],
  ['setPageZoom', () => api.setPageZoom('in'), IpcChannels.zoomCommand, { direction: 'in' }],
  ['resizePopup', () => api.resizePopup(400), IpcChannels.popupResize, { height: 400 }],
  [
    'openSubmenu',
    () => api.openSubmenu('main', { x: 1, y: 2, width: 3, height: 4 }, { height: 200 }),
    IpcChannels.submenuOpen,
    { kind: 'main', anchor: { x: 1, y: 2, width: 3, height: 4 }, height: 200 },
  ],
];

const INVOKES: Row[] = [
  ['isWindowMaximized', () => api.isWindowMaximized(), IpcChannels.windowIsMaximized],
  ['listRecentlyClosedTabs', () => api.listRecentlyClosedTabs(), IpcChannels.tabsRecentlyClosed],
  ['captureActiveTab', () => api.captureActiveTab(), IpcChannels.tabsCapture],
  ['getTabsState', () => api.getTabsState(), IpcChannels.tabsGetState],
  ['getPageZoom', () => api.getPageZoom(), IpcChannels.zoomGet],
  ['getPageMenuContext', () => api.getPageMenuContext(), IpcChannels.pageMenuGetContext],
];

describe('ipcRenderer.send methods', () => {
  it.each(SENDS)('%s → its channel with the right payload', (_n, run, channel, payload) => {
    run();
    if (payload === undefined) expect(ipc.send).toHaveBeenCalledWith(channel);
    else expect(ipc.send).toHaveBeenCalledWith(channel, payload);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('invoke methods', () => {
  it.each(INVOKES)('%s → its channel', (_n, run, channel) => {
    run();
    expect(invoke).toHaveBeenCalledWith(channel);
  });
});

describe('reopenClosedTab', () => {
  it('sends {} when no id is given, { id } when one is', () => {
    api.reopenClosedTab();
    expect(ipc.send).toHaveBeenLastCalledWith(IpcChannels.tabsReopenClosed, {});
    api.reopenClosedTab('c1');
    expect(ipc.send).toHaveBeenLastCalledWith(IpcChannels.tabsReopenClosed, { id: 'c1' });
  });
});

describe('ensureActiveGroup', () => {
  it('unwraps the { groupId } response to the bare id', async () => {
    invoke.mockResolvedValue({ groupId: 'g-7' });
    await expect(api.ensureActiveGroup()).resolves.toBe('g-7');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.agentEnsureGroup);
  });
});

describe('onActiveGroupChange', () => {
  it('derives the active group from tab state and only fires on a change', () => {
    const cb = vi.fn();
    const off = api.onActiveGroupChange(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;

    listener({}, { activeId: 't1', tabs: [{ id: 't1', groupId: 'g1' }] });
    listener({}, { activeId: 't1', tabs: [{ id: 't1', groupId: 'g1' }] }); // no change
    listener({}, { activeId: 't1', tabs: [{ id: 't1', groupId: null }] }); // changed → null

    expect(cb.mock.calls).toEqual([['g1'], [null]]);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.tabsState, listener);
  });
});

describe('a representative subscription', () => {
  it('onOmniboxFocus forwards a bare signal and unsubscribes cleanly', () => {
    const cb = vi.fn();
    const off = api.onOmniboxFocus(cb);
    const listener = ipc.on.mock.calls[0]![1] as () => void;
    listener();
    expect(cb).toHaveBeenCalledWith();
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.omniboxFocus, listener);
  });
});
