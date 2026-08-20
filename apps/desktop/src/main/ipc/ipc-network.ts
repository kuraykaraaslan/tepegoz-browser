import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { BrowserWindow, dialog } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  type BinaryStatus,
  type GroupNetworkRoute,
  type NetworkState,
  type PickedWireguardProfile,
  type TabNetworkRoute,
} from '@tepegoz/desktop-ipc';
import {
  AddNetworkConnectionSchema,
  BindGroupNetworkSchema,
  BindTabNetworkSchema,
  RemoveNetworkConnectionSchema,
  SetBinaryPathSchema,
  SetConnectionActiveSchema,
  SetGeneralBindingSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { isValidConnectionId } from '@tepegoz/shared-types';
import PreferenceStore from '@tepegoz/preferences';
import { binDir, locateBinary, type VpnBinary } from '../network/vpn-binaries.electron';
import VpnSecrets from '../network/vpn-secrets.electron';
import { parseWireGuardConfig, summarize } from '../network/wireguard-config';
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

/**
 * A group's route, split into a VPN leg and a Tor leg.
 *
 * The split is what makes "this group is on the VPN *and* on Tor" showable: a group resolves to exactly
 * one route, so the combination is Tor CHAINED through a VPN, and the badge shows both healths side by
 * side rather than picking one to display and hiding the other.
 */
function groupRouteFor(groupId: string): GroupNetworkRoute | null {
  const { resolved } = BindingService.resolveForGroup(groupId);
  if (resolved.connectionId === null) return null;
  const connection = ConnectionPool.get(resolved.connectionId);
  if (connection === undefined) {
    // Bound to a connection the pool has never heard of. Shown as a dead route rather than hidden: the
    // kill-switch is blocking these tabs, and a group that looks Direct while nothing loads is worse
    // than one that looks broken.
    return { connectionId: resolved.connectionId, vpn: 'down', tor: null, label: resolved.connectionId };
  }
  if (connection.kind !== 'tor') {
    return {
      connectionId: connection.id,
      vpn: connection.status,
      tor: null,
      label: connection.label,
    };
  }
  const upstream =
    connection.upstreamConnectionId === null ? undefined : ConnectionPool.get(connection.upstreamConnectionId);
  return {
    connectionId: connection.id,
    vpn: upstream?.status ?? null,
    tor: connection.status,
    label: upstream === undefined ? connection.label : `${connection.label} → ${upstream.label}`,
  };
}

/** The routing picture for ONE window — its own tabs and groups, plus the profile-wide pieces. */
export function networkStateFor(win: BrowserWindow): NetworkState {
  BindingService.prune();
  const wt = TabManager.forWindow(win);
  const state = wt?.getState();
  const tabs: Record<string, TabNetworkRoute> = {};
  for (const tab of state?.tabs ?? []) tabs[tab.id] = routeFor(tab.id);

  const groups: Record<string, GroupNetworkRoute> = {};
  for (const group of state?.groups ?? []) {
    const route = groupRouteFor(group.id);
    // Direct groups are omitted, so "no entry" and "no badge" are the same fact rather than two.
    if (route !== null) groups[group.id] = route;
  }

  return {
    connections: ConnectionPool.list(),
    general: BindingService.general(),
    tabs,
    groups,
    binaries: { wireproxy: binaryStatus('wireproxy'), tor: binaryStatus('tor') },
    secretsAvailable: VpnSecrets.isAvailable(),
  };
}

function binaryStatus(binary: VpnBinary): BinaryStatus {
  try {
    return { found: true, path: locateBinary(binary) };
  } catch {
    // Not an error state to hide: the manager shows the drop-in directory, which is far more useful
    // than discovering at connect time that nothing happens.
    return { found: false, path: binDir() };
  }
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
    const id = freshConnectionId(input.label);
    // Sync-meta down-payment: recorded now so Phase 3's account sync is not a schema migration.
    const meta = { note: input.note, updatedAt: Date.now(), version: 1 };

    if (input.kind === 'wireguard') {
      const text = readFileSync(input.sourcePath, 'utf8');
      // Re-parsed, not trusted from the pick: this is the copy that will actually run, and the DNS rule
      // has to hold on it.
      const summary = summarize(parseWireGuardConfig(text));
      VpnSecrets.save(id, text);
      ConnectionPool.add({ ...meta, id, label: input.label, kind: 'wireguard', endpoint: summary.endpoint });
    } else if (input.kind === 'tor') {
      if (input.upstreamConnectionId !== null && !ConnectionPool.has(input.upstreamConnectionId)) {
        throw new Error(`No such upstream connection: ${input.upstreamConnectionId}`);
      }
      ConnectionPool.add({
        ...meta,
        id,
        label: input.label,
        kind: 'tor',
        upstreamConnectionId: input.upstreamConnectionId,
      });
    } else {
      ConnectionPool.add({ ...meta, id, label: input.label, kind: 'byo-socks', socksPort: input.socksPort });
    }

    Logger.info('Network connection added', { id, kind: input.kind });
    broadcastNetworkState();
    return Promise.resolve();
  });

  handleAsync(
    IpcChannels.networkPickWireguard,
    async (event): Promise<PickedWireguardProfile | null> => {
      if (!VpnSecrets.isAvailable()) {
        // Refused before the picker opens: a WireGuard profile is a private key, and the only place to
        // put it would be plain text on disk.
        throw new Error('The OS keychain is unavailable, so a WireGuard profile cannot be stored safely');
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts: Electron.OpenDialogOptions = {
        title: 'WireGuard profile',
        filters: [{ name: 'WireGuard', extensions: ['conf'] }],
        properties: ['openFile'],
      };
      const { canceled, filePaths } =
        win === null ? await dialog.showOpenDialog(opts) : await dialog.showOpenDialog(win, opts);
      const filePath = filePaths[0];
      if (canceled || filePath === undefined) return null;

      // Parsed at PICK time so the form can show what it found and refuse early — and parsed AGAIN at
      // commit, because the file could change in between and the DNS rule must hold on what runs.
      const summary = summarize(parseWireGuardConfig(readFileSync(filePath, 'utf8')));
      return {
        path: filePath,
        fileName: basename(filePath),
        endpoint: summary.endpoint,
        dns: summary.dns,
        fullTunnel: summary.fullTunnel,
      };
    },
  );

  handleAsync(IpcChannels.networkSetActive, async (_event, payload): Promise<void> => {
    const { id, active } = SetConnectionActiveSchema.parse(payload);
    if (active) await ConnectionPool.ensureUp(id);
    else await ConnectionPool.takeDown(id);
    broadcastNetworkState();
  });

  handleAsync(IpcChannels.networkSetBinaryPath, async (_event, payload): Promise<void> => {
    const { binary, path } = SetBinaryPathSchema.parse(payload);
    const current = PreferenceStore.getAll().networkBinaries;
    PreferenceStore.update({ networkBinaries: { ...current, [binary]: path } });
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
  return {
    connections: ConnectionPool.list(),
    general: BindingService.general(),
    tabs: {},
    groups: {},
    binaries: { wireproxy: binaryStatus('wireproxy'), tor: binaryStatus('tor') },
    secretsAvailable: VpnSecrets.isAvailable(),
  };
}
