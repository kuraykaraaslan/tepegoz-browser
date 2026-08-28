import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { TAB_GROUP_COLORS } from '@tepegoz/tab-engine';

/**
 * Native tab-group header right-click menu (ADR-0020). Rename asks the CHROME to open its inline
 * editor (not a native prompt); the colour submenu is a checkbox list with the current colour ticked;
 * every other action runs against `TabManager`.
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
      renameGroup: 'Rename',
      groupColor: 'Colour',
      routeGroupThrough: 'Route through…',
      newTabInGroup: 'New tab in group',
      ungroup: 'Ungroup',
      closeGroup: 'Close group',
      groupColors: Object.fromEntries(TAB_GROUP_COLORS.map((c) => [c, c.toUpperCase()])),
    },
  }),
}));
vi.mock('./route-menu', () => ({ routeSubmenu: () => [] }));

const TM = {
  groupMenuInfo: vi.fn<(id: string) => { color: string } | undefined>(() => ({ color: 'blue' })),
  recolorGroup: vi.fn(),
  newTabInGroup: vi.fn(),
  ungroup: vi.fn(),
  closeGroup: vi.fn(),
};
vi.mock('../tabs', () => ({ default: TM }));

const { showGroupContextMenu } = await import('./tab-group-context-menu');

const sent: unknown[] = [];
const win = {
  isDestroyed: () => false,
  webContents: {
    send: (ch: string, p: unknown) => {
      sent.push({ ch, p });
    },
  },
} as never;
const find = (label: string) => built[0]?.find((i) => i.label === label);
const click = (label: string): void => {
  (find(label)?.click as (() => void) | undefined)?.();
};

beforeEach(() => {
  built.length = 0;
  sent.length = 0;
  vi.clearAllMocks();
  TM.groupMenuInfo.mockReturnValue({ color: 'blue' });
});

describe('showGroupContextMenu', () => {
  it('builds nothing when the group vanished', () => {
    TM.groupMenuInfo.mockReturnValue(undefined);
    showGroupContextMenu(win, 'g1');
    expect(built).toHaveLength(0);
  });

  it('Rename asks the chrome renderer to open its inline editor for this group', () => {
    showGroupContextMenu(win, 'g9');
    click('Rename');
    expect(sent).toEqual([{ ch: IpcChannels.tabsGroupStartRename, p: 'g9' }]);
  });

  it('the colour submenu is one checkbox per palette colour with the current one ticked', () => {
    showGroupContextMenu(win, 'g1');
    const sub = (find('Colour')?.submenu ?? []) as MenuItemConstructorOptions[];
    expect(sub).toHaveLength(TAB_GROUP_COLORS.length);
    expect(sub.every((i) => i.type === 'checkbox')).toBe(true);
    const checked = sub.filter((i) => i.checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]?.label).toBe('BLUE');
  });

  it('picking a colour recolours the group', () => {
    showGroupContextMenu(win, 'g1');
    const sub = (find('Colour')?.submenu ?? []) as MenuItemConstructorOptions[];
    const red = sub.find((i) => i.label === 'RED');
    (red?.click as (() => void) | undefined)?.();
    expect(TM.recolorGroup).toHaveBeenCalledWith('g1', 'red');
  });

  it('new-tab / ungroup / close-group route to TabManager', () => {
    showGroupContextMenu(win, 'g1');
    click('New tab in group');
    click('Ungroup');
    click('Close group');
    expect(TM.newTabInGroup).toHaveBeenCalledWith('g1');
    expect(TM.ungroup).toHaveBeenCalledWith('g1');
    expect(TM.closeGroup).toHaveBeenCalledWith('g1');
  });
});
