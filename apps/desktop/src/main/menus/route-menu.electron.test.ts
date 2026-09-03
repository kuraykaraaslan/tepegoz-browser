import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * The "Route this tab / group through…" submenu (Phase 5). It is built in main against the pool's
 * live state each time it opens, so the RADIO state reflects reality — the only way a user can tell
 * "inherited from the group" apart from "set here". Every click routes through `BindingService`.
 */

vi.mock('electron', () => ({}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      routeInheritGroup: 'Inherit from group',
      routeInheritGeneral: 'Inherit from general',
      routeDirect: 'Direct (no tunnel)',
      routeNoConnections: 'No connections configured',
      routeReloadNotice: 'Changing the route reloads the tab',
      routeManage: 'Manage connections…',
      routeStatusUp: 'connected',
      routeStatusConnecting: 'connecting',
      routeStatusDown: 'not connected',
    },
  }),
}));

const pool = vi.hoisted(() => ({ connections: [] as { id: string; label: string; status: string }[] }));
vi.mock('../network/connection-pool.electron', () => ({ default: { list: () => pool.connections } }));

interface Bind {
  kind: string;
  connectionId?: string;
}
const binding = vi.hoisted((): {
  tab: Bind;
  group: Bind;
  bindTab: ReturnType<typeof vi.fn>;
  bindGroup: ReturnType<typeof vi.fn>;
} => ({
  tab: { kind: 'inherit' },
  group: { kind: 'direct' },
  bindTab: vi.fn(() => Promise.resolve()),
  bindGroup: vi.fn(() => Promise.resolve()),
}));
vi.mock('../network/binding-service.electron', () => ({
  default: {
    tabBinding: () => binding.tab,
    groupBinding: () => binding.group,
    bindTab: (id: string, t: unknown) => binding.bindTab(id, t) as Promise<void>,
    bindGroup: (id: string, t: unknown) => binding.bindGroup(id, t) as Promise<void>,
  },
}));

const openInternalPage = vi.fn();
vi.mock('../tabs', () => ({
  default: {
    openInternalPage: (u: string) => {
      openInternalPage(u);
    },
  },
}));
vi.mock('../ipc/ipc-network', () => ({ broadcastNetworkState: vi.fn() }));

const { routeSubmenu } = await import('./route-menu');

const labels = (items: MenuItemConstructorOptions[]) => items.map((i) => i.label ?? `<${i.type}>`);
const click = (items: MenuItemConstructorOptions[], label: string): void => {
  const item = items.find((i) => i.label === label);
  (item?.click as (() => void) | undefined)?.();
};

beforeEach(() => {
  pool.connections = [];
  binding.tab = { kind: 'inherit' };
  binding.group = { kind: 'direct' };
  binding.bindTab.mockClear();
  binding.bindGroup.mockClear();
  logger.error.mockClear();
  openInternalPage.mockClear();
});

describe('routeSubmenu', () => {
  it('a tab scope offers "inherit from group"; a group scope offers "inherit from general"', () => {
    expect(labels(routeSubmenu('tab', 't1'))).toContain('Inherit from group');
    expect(labels(routeSubmenu('group', 'g1'))).toContain('Inherit from general');
  });

  it('checks the radio that matches the current binding', () => {
    binding.tab = { kind: 'direct' };
    const items = routeSubmenu('tab', 't1');
    expect(items.find((i) => i.label === 'Direct (no tunnel)')?.checked).toBe(true);
    expect(items.find((i) => i.label === 'Inherit from group')?.checked).toBe(false);
  });

  it('shows a disabled "no connections" row when the pool is empty', () => {
    const items = routeSubmenu('tab', 't1');
    const none = items.find((i) => i.label === 'No connections configured');
    expect(none?.enabled).toBe(false);
  });

  it('lists each connection with its health spelled out, and checks the bound one', () => {
    pool.connections = [
      { id: 'c1', label: 'Sweden', status: 'up' },
      { id: 'c2', label: 'Iceland', status: 'connecting' },
    ];
    binding.tab = { kind: 'connection', connectionId: 'c2' };
    const items = routeSubmenu('tab', 't1');
    expect(labels(items)).toEqual(expect.arrayContaining(['Sweden — connected', 'Iceland — connecting']));
    expect(items.find((i) => i.label === 'Iceland — connecting')?.checked).toBe(true);
    expect(items.find((i) => i.label === 'Sweden — connected')?.checked).toBe(false);
  });

  it('spells out a down connection as "not connected"', () => {
    pool.connections = [{ id: 'c1', label: 'Sweden', status: 'down' }];
    expect(labels(routeSubmenu('tab', 't1'))).toContain('Sweden — not connected');
  });

  it('clicking a connection binds that scope to it', () => {
    pool.connections = [{ id: 'c1', label: 'Sweden', status: 'up' }];
    click(routeSubmenu('group', 'g9'), 'Sweden — connected');
    expect(binding.bindGroup).toHaveBeenCalledWith('g9', { kind: 'connection', connectionId: 'c1' });
  });

  it('logs a route change that fails to apply, without throwing', async () => {
    pool.connections = [{ id: 'c1', label: 'Sweden', status: 'up' }];
    binding.bindGroup.mockRejectedValueOnce(new Error('tunnel down'));

    click(routeSubmenu('group', 'g9'), 'Sweden — connected');
    await new Promise((r) => setTimeout(r, 0)); // let the void apply().catch(...) settle

    expect(logger.error).toHaveBeenCalledWith(
      'Route change failed',
      expect.objectContaining({
        scope: 'group',
        scopeId: 'g9',
        err: expect.stringContaining('tunnel down') as string,
      }),
    );
  });

  it('clicking Direct / Inherit binds those', () => {
    const items = routeSubmenu('tab', 't1');
    click(items, 'Direct (no tunnel)');
    expect(binding.bindTab).toHaveBeenCalledWith('t1', { kind: 'direct' });
    click(items, 'Inherit from group');
    expect(binding.bindTab).toHaveBeenCalledWith('t1', { kind: 'inherit' });
  });

  it('"Manage connections…" opens Settings', () => {
    click(routeSubmenu('tab', 't1'), 'Manage connections…');
    expect(openInternalPage).toHaveBeenCalled();
  });
});
