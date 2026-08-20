import { BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  type NetworkState,
  type TabNetworkRoute,
} from '@tepegoz/desktop-ipc';
import {
  AddNetworkConnectionSchema,
  BindGroupNetworkSchema,
  BindTabNetworkSchema,
  RemoveNetworkConnectionSchema,
  SetGeneralBindingSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { isValidConnectionId, type NetworkConnection } from '@tepegoz/shared-types';
import TabManager from '../tabs';
import BindingService from '../network/binding-service.electron';
import ConnectionPool from '../network/connection-pool.electron';
import { handleAsync } from './ipc-helpers';

/**
 * The network-privacy bridge (Phase 5): read the routing picture, change a binding, manage connections.
 *
 * State is PUSHED rather than polled, because the interesting event is a tunnel dropping — and an
 * indicator that only refreshes when the chrome happens to ask is an indicator that will show "protected"
 * for however long that gap is. `ConnectionPool` notifies on every status change and this rebroadcasts.
 *
 * Every payload is `safeParse`d (via the schema-validated `handleAsync` boundary): these come from the
 * untrusted renderer, and a connection id in particular names a session partition.
 */

/** A label becomes a partition-name component, so it is reduced to the slug shape ids must have. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** A stable, unique, valid id for a new connection. Falls back to a counter when the label has no
 *  usable characters at all (a label of only emoji is a real thing users do). */
function freshConnectionId(label: string): string {
  const base = slugify(label);
  const seed = isValidConnectionId(base) ? base : 'connection';
  let candidate = seed;
  let n = 2;
  while (ConnectionPool.has(candidate)) {
    candidate = `${seed}-${String(n)}`;
    n += 1;
  }
  return candidate;
}

function routeFor(tabId: string): TabNetworkRoute {
  const { resolved, source } = BindingService.resolveFor(tabId);
  return {
    connectionId: resolved.connectionId,
    source,
    egressAllowed: BindingService.mayEgress(tabId),
  };
}

/** The routing picture for ONE window — its own tabs and groups, plus the profile-wide pieces. */
export function networkStateFor(win: BrowserWindow): NetworkState {
  BindingService.prune();
  const wt = TabManager.forWindow(win);
  const state = wt?.getState();
  const tabs: Record<string, TabNetworkRoute> = {};
  for (const tab of state?.tabs ?? []) tabs[tab.id] = routeFor(tab.id);

  const groups: Record<string, string | null> = {};
  for (const group of state?.groups ?? []) {
    const binding = BindingService.groupBinding(group.id);
    if (binding.kind === 'inherit') continue; // absent = inherits, which is not the same as Direct
    groups[group.id] = binding.kind === 'direct' ? null : binding.connectionId;
  }

  return {
    connections: ConnectionPool.list(),
    general: BindingService.general(),
    tabs,
    groups,
  };
}

/** Push the current picture to every open chrome window. Called on any change, including a tunnel drop. */
export function broadcastNetworkState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IpcChannels.networkState, networkStateFor(win));
    } catch (err) {
      Logger.warn('Could not push network state to a window', { err: String(err) });
    }
  }
}

export function registerNetworkIpc(): void {
  handleAsync(IpcChannels.networkGetState, async (event): Promise<NetworkState> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return Promise.resolve(win === null ? emptyState() : networkStateFor(win));
  });

  handleAsync(IpcChannels.networkBindTab, async (_event, payload): Promise<void> => {
    const { tabId, binding } = BindTabNetworkSchema.parse(payload);
    await BindingService.bindTab(tabId, binding);
    broadcastNetworkState();
  });

  handleAsync(IpcChannels.networkBindGroup, async (_event, payload): Promise<void> => {
    const { groupId, binding } = BindGroupNetworkSchema.parse(payload);
    await BindingService.bindGroup(groupId, binding);
    broadcastNetworkState();
  });

  handleAsync(IpcChannels.networkSetGeneral, async (_event, payload): Promise<void> => {
    await BindingService.setGeneral(SetGeneralBindingSchema.parse(payload));
    broadcastNetworkState();
  });

  handleAsync(IpcChannels.networkAddConnection, async (_event, payload): Promise<void> => {
    const input = AddNetworkConnectionSchema.parse(payload);
    const connection: NetworkConnection = {
      id: freshConnectionId(input.label),
      label: input.label,
      kind: 'byo-socks',
      socksPort: input.socksPort,
      note: input.note,
      // Sync-meta down-payment: recorded now so Phase 3's account sync is not a schema migration.
      updatedAt: Date.now(),
      version: 1,
    };
    ConnectionPool.add(connection);
    Logger.info('Network connection added', { id: connection.id });
    broadcastNetworkState();
    return Promise.resolve();
  });

  handleAsync(IpcChannels.networkRemoveConnection, async (_event, payload): Promise<void> => {
    const id = RemoveNetworkConnectionSchema.parse(payload);
    // Bindings first: a tab still pointing at a removed connection would be blocked forever with no way
    // for the user to reach the connection they would need to fix.
    await BindingService.releaseConnection(id);
    await ConnectionPool.remove(id);
    broadcastNetworkState();
  });
}

function emptyState(): NetworkState {
  return { connections: ConnectionPool.list(), general: BindingService.general(), tabs: {}, groups: {} };
}
