import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * The native "Hidden tabs" menu — the caption button's counterpart. Lists this window's hidden tabs
 * (title, else url, elided), each unhiding on click, plus "Unhide all". No menu at all when nothing
 * is hidden (matches Chrome).
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
  mainStrings: () => ({ browser: { hiddenTabs: 'Hidden tabs', unhideAll: 'Unhide all' } }),
}));

const tabs = vi.hoisted(() => ({
  list: [] as { id: string; title: string; url: string; hidden?: boolean }[],
  unhide: vi.fn(),
}));
vi.mock('../tabs', () => ({
  default: {
    getState: () => ({ tabs: tabs.list }),
    unhideTab: (id: string) => {
      tabs.unhide(id);
    },
  },
}));

const { showHiddenTabsMenu } = await import('./hidden-tabs-menu');
const win = {} as never;

beforeEach(() => {
  built.length = 0;
  tabs.unhide.mockClear();
  tabs.list = [];
});

describe('showHiddenTabsMenu', () => {
  it('builds no menu when nothing is hidden', () => {
    tabs.list = [{ id: 't1', title: 'Visible', url: 'https://a/', hidden: false }];
    showHiddenTabsMenu(win);
    expect(built).toHaveLength(0);
  });

  it('lists each hidden tab (title, else url), then a separator + Unhide all', () => {
    tabs.list = [
      { id: 'h1', title: 'My Page', url: 'https://a/', hidden: true },
      { id: 'h2', title: '  ', url: 'https://b.example/x', hidden: true },
      { id: 'v', title: 'Nope', url: 'https://c/', hidden: false },
    ];
    showHiddenTabsMenu(win);
    const t = built[0] ?? [];
    expect(t.map((i) => i.label ?? `<${i.type}>`)).toEqual([
      'My Page',
      'https://b.example/x',
      '<separator>',
      'Unhide all',
    ]);
  });

  it('elides a very long title at 60 chars', () => {
    tabs.list = [{ id: 'h1', title: 'x'.repeat(200), url: 'https://a/', hidden: true }];
    showHiddenTabsMenu(win);
    const label = built[0]?.[0]?.label ?? '';
    expect(label.length).toBe(60);
    expect(label.endsWith('…')).toBe(true);
  });

  it('clicking a row unhides that tab; Unhide all unhides every hidden one', () => {
    tabs.list = [
      { id: 'h1', title: 'A', url: 'https://a/', hidden: true },
      { id: 'h2', title: 'B', url: 'https://b/', hidden: true },
    ];
    showHiddenTabsMenu(win);
    const t = built[0] ?? [];
    (t[0]?.click as (() => void) | undefined)?.();
    expect(tabs.unhide).toHaveBeenCalledWith('h1');
    tabs.unhide.mockClear();
    (t.at(-1)?.click as (() => void) | undefined)?.();
    expect(tabs.unhide.mock.calls.map(([id]) => id as string)).toEqual(['h1', 'h2']);
  });
});
