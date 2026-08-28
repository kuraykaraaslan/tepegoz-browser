import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * Native tab right-click menu. Every action runs against `TabManager`'s authoritative state; the
 * renderer only forwards which tab was clicked. What's pinned: the guard rows (Hide needs another
 * visible tab, Discard defers to `canDiscardTab`, Close-others/right depend on position), the
 * pin/unpin label toggle, and the group rows appearing only for a grouped tab.
 */

const built: MenuItemConstructorOptions[][] = [];
vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (t: MenuItemConstructorOptions[]) => {
      built.push(t);
      return { popup: vi.fn() };
    },
  },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      pinTab: 'Pin',
      unpinTab: 'Unpin',
      hideTab: 'Hide',
      discardTab: 'Discard',
      routeTabThrough: 'Route through…',
      addToGroup: 'Add to group',
      addToNewGroup: 'New group',
      unnamedGroup: 'Group',
      removeFromGroup: 'Remove from group',
      ungroup: 'Ungroup',
      newTabRight: 'New tab to the right',
      reload: 'Reload',
      duplicateTab: 'Duplicate',
      closeTab: 'Close',
      closeOtherTabs: 'Close others',
      closeTabsRight: 'Close to the right',
    },
  }),
}));
vi.mock('./route-menu', () => ({ routeSubmenu: () => [] }));

const TM = {
  getState: vi.fn(),
  setPinned: vi.fn(),
  hideTab: vi.fn(),
  discardTab: vi.fn(),
  canDiscardTab: vi.fn(() => true),
  createGroup: vi.fn(),
  assignToGroup: vi.fn(),
  removeFromGroup: vi.fn(),
  ungroup: vi.fn(),
  createTabRight: vi.fn(),
  reloadTab: vi.fn(),
  duplicateTab: vi.fn(),
  closeTab: vi.fn(),
  closeOtherTabs: vi.fn(),
  closeTabsToRight: vi.fn(),
};
vi.mock('../tabs', () => ({ default: TM }));

const { showTabContextMenu } = await import('./tab-context-menu');
const win = {} as never;

const tab = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'T',
  pinned: false,
  groupId: null,
  hidden: false,
  ...over,
});
function setState(tabs: unknown[], groups: unknown[] = []) {
  TM.getState.mockReturnValue({ tabs, groups });
}
const find = (label: string) => built[0]?.find((i) => i.label === label);
const click = (label: string): void => {
  (find(label)?.click as (() => void) | undefined)?.();
};

beforeEach(() => {
  built.length = 0;
  vi.clearAllMocks();
  TM.canDiscardTab.mockReturnValue(true);
  setState([tab()]);
});

describe('showTabContextMenu', () => {
  it('builds nothing if the tab vanished between right-click and IPC delivery', () => {
    setState([tab({ id: 'other' })]);
    showTabContextMenu(win, 't1');
    expect(built).toHaveLength(0);
  });

  it('toggles the pin label and calls setPinned with the inverse', () => {
    setState([tab({ pinned: true })]);
    showTabContextMenu(win, 't1');
    expect(find('Unpin')).toBeTruthy();
    click('Unpin');
    expect(TM.setPinned).toHaveBeenCalledWith('t1', false);
  });

  it('disables Hide when it is the only visible tab, enables it otherwise', () => {
    setState([tab()]);
    showTabContextMenu(win, 't1');
    expect(find('Hide')?.enabled).toBe(false);
    built.length = 0;
    setState([tab(), tab({ id: 't2' })]);
    showTabContextMenu(win, 't1');
    expect(find('Hide')?.enabled).toBe(true);
  });

  it('mirrors canDiscardTab onto the Discard row', () => {
    TM.canDiscardTab.mockReturnValue(false);
    showTabContextMenu(win, 't1');
    expect(find('Discard')?.enabled).toBe(false);
  });

  it('shows the group rows only for a grouped tab', () => {
    setState([tab()]);
    showTabContextMenu(win, 't1');
    expect(find('Remove from group')).toBeUndefined();
    built.length = 0;
    setState([tab({ groupId: 'g1' })], [{ id: 'g1', name: 'Work' }]);
    showTabContextMenu(win, 't1');
    expect(find('Remove from group')).toBeTruthy();
    click('Ungroup');
    expect(TM.ungroup).toHaveBeenCalledWith('g1');
  });

  it('the "Add to group" submenu offers a new group + the OTHER groups (unnamed fallback)', () => {
    setState(
      [tab({ groupId: 'g1' })],
      [
        { id: 'g1', name: 'Mine' },
        { id: 'g2', name: '  ' },
      ],
    );
    showTabContextMenu(win, 't1');
    const sub = (find('Add to group')?.submenu ?? []) as MenuItemConstructorOptions[];
    expect(sub.map((i) => i.label ?? `<${i.type}>`)).toEqual(['New group', '<separator>', 'Group']);
    (sub[0]?.click as (() => void) | undefined)?.();
    expect(TM.createGroup).toHaveBeenCalledWith(['t1']);
  });

  it('close-others needs >1 tab; close-to-right needs a tab after this one', () => {
    setState([tab()]);
    showTabContextMenu(win, 't1');
    expect(find('Close others')?.enabled).toBe(false);
    expect(find('Close to the right')?.enabled).toBe(false);
    built.length = 0;
    setState([tab(), tab({ id: 't2' })]);
    showTabContextMenu(win, 't1');
    expect(find('Close others')?.enabled).toBe(true);
    expect(find('Close to the right')?.enabled).toBe(true);
  });

  it('routes the simple actions to TabManager', () => {
    showTabContextMenu(win, 't1');
    click('Reload');
    click('Duplicate');
    click('New tab to the right');
    click('Close');
    expect(TM.reloadTab).toHaveBeenCalledWith('t1');
    expect(TM.duplicateTab).toHaveBeenCalledWith('t1');
    expect(TM.createTabRight).toHaveBeenCalledWith('t1');
    expect(TM.closeTab).toHaveBeenCalledWith('t1');
  });
});
