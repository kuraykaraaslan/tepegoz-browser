import { type MenuItemConstructorOptions } from 'electron';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import { Logger } from '@tepegoz/libs';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';
import BindingService from '../network/binding-service.electron';
import ConnectionPool from '../network/connection-pool.electron';
import { broadcastNetworkState } from '../ipc/ipc-network';

/**
 * The "Route this tab / group through…" submenu, shared by the tab and tab-group context menus.
 *
 * Native, not a React modal, and that is the right call rather than a shortcut: the surrounding menus are
 * already real OS menus built in main against `TabManager`'s authoritative state, and the picker's whole
 * content — which connections exist, which is live, what this scope currently resolves to — is main-side
 * state. Rendering it here means the list cannot be stale by the time it is clicked, and the renderer
 * never learns anything about the pool it does not already show.
 *
 * Every entry is a radio item, because a scope resolves to exactly ONE destination — showing the current
 * one checked is the only way a user can tell "inherited from the group" apart from "set here", which is
 * the distinction the whole three-scope model rests on.
 */

export type RouteScope = 'tab' | 'group';

/** The label for one connection, with its live health spelled out rather than encoded in a colour. */
function connectionLabel(label: string, status: string): string {
  const t = mainStrings();
  const word =
    status === 'up'
      ? t.browser.routeStatusUp
      : status === 'connecting'
        ? t.browser.routeStatusConnecting
        : t.browser.routeStatusDown;
  return `${label} — ${word}`;
}

/**
 * Build the submenu for one scope, reading the CURRENT binding each time the menu is opened, so the radio
 * state reflects reality (including a route set from another window) rather than the last click.
 */
export function routeSubmenu(scope: RouteScope, scopeId: string): MenuItemConstructorOptions[] {
  const t = mainStrings();
  const connections = ConnectionPool.list();
  const binding =
    scope === 'tab' ? BindingService.tabBinding(scopeId) : BindingService.groupBinding(scopeId);

  const apply = (run: () => Promise<void>): void => {
    void run()
      .then(broadcastNetworkState)
      .catch((err: unknown) => {
        // A failed bind leaves the tab where it was (BindingService guarantees that); surfacing it here
        // as a log line is honest about the fact that the click did not take effect.
        Logger.error('Route change failed', { scope, scopeId, err: String(err) });
      });
  };

  const bind = (target: Parameters<typeof BindingService.bindTab>[1]): void => {
    apply(async () =>
      scope === 'tab'
        ? BindingService.bindTab(scopeId, target)
        : BindingService.bindGroup(scopeId, target),
    );
  };

  const items: MenuItemConstructorOptions[] = [
    {
      label: scope === 'tab' ? t.browser.routeInheritGroup : t.browser.routeInheritGeneral,
      type: 'radio',
      checked: binding.kind === 'inherit',
      click: () => bind({ kind: 'inherit' }),
    },
    {
      label: t.browser.routeDirect,
      type: 'radio',
      checked: binding.kind === 'direct',
      click: () => bind({ kind: 'direct' }),
    },
  ];

  if (connections.length === 0) {
    items.push({ type: 'separator' }, { label: t.browser.routeNoConnections, enabled: false });
  } else {
    items.push({ type: 'separator' });
    for (const connection of connections) {
      items.push({
        label: connectionLabel(connection.label, connection.status),
        type: 'radio',
        checked: binding.kind === 'connection' && binding.connectionId === connection.id,
        click: () => bind({ kind: 'connection', connectionId: connection.id }),
      });
    }
  }

  items.push(
    { type: 'separator' },
    // Stated, not discovered: a re-bind destroys and rebuilds the affected views, because Electron binds
    // a WebContents to its session at creation. The user should read that before clicking, not after.
    { label: t.browser.routeReloadNotice, enabled: false },
    {
      label: t.browser.routeManage,
      click: () => {
        TabManager.openInternalPage(INTERNAL_SETTINGS_URL);
      },
    },
  );

  return items;
}
