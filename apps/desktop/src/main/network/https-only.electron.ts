import { webContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { connectionIdOfPartition, isTunneledPartition } from '@tepegoz/tab-engine';
import BrowsingWebRequestService, {
  type BeforeRequestContext,
} from '../web-request/browsing-web-request-service.electron';
import ConnectionPool from './connection-pool.electron';
import {
  decide,
  normalizeHost,
  UpgradeTracker,
  type CancelReason,
  type TunnelKind,
} from './https-only';

/**
 * The Electron seam of HTTPS-only on tunnel-bound partitions (ADR-0050): a synchronous
 * `onBeforeRequest` handler that upgrades `http:` to `https:` (or cancels what cannot be upgraded) so
 * cleartext never reaches a tunnel's exit. The policy itself is the pure `./https-only` module; this
 * file only feeds it facts (partition, tunnel kind, preference, bypass state) and records what happened
 * so the tab can explain a failure.
 *
 * Fails CLOSED on a tunnel partition (any internal error cancels the request) and never touches a
 * Direct partition. The bypass is session-only and in-memory by decision: it dies with the process.
 */

const HANDLER_ID = 'https-only';
const BYPASS_CAP = 200;
const PENDING_TTL_MS = 60_000;
const PENDING_CAP = 100;

/** What the handler did to a main-frame request, kept so a later `did-fail-load` can be explained. */
export interface PendingHttpsOnly {
  host: string;
  httpUrl: string;
  reason: 'upgraded' | CancelReason;
  ts: number;
}

const bypassed = new Set<string>();
const pending = new Map<number, PendingHttpsOnly>();
let tracker = new UpgradeTracker();

function bypassKey(partition: string, host: string): string {
  return `${partition}|${normalizeHost(host)}`;
}

export function isHttpsOnlyBypassed(partition: string, host: string): boolean {
  return bypassed.has(bypassKey(partition, host));
}

/** Allow plain http to `host` on `partition` until the process exits. Oldest entries fall out at the cap. */
export function addHttpsOnlyBypass(partition: string, host: string): void {
  const key = bypassKey(partition, host);
  bypassed.delete(key);
  bypassed.add(key);
  while (bypassed.size > BYPASS_CAP) {
    const oldest = bypassed.values().next();
    if (oldest.done) break;
    bypassed.delete(oldest.value);
  }
}

/** The kind of tunnel a partition is bound to. An unknown connection is never treated as Tor. */
export function tunnelKindOfPartition(partition: string): TunnelKind {
  const id = connectionIdOfPartition(partition);
  if (id === null) return 'direct'; // not bound to any connection
  switch (ConnectionPool.get(id)?.kind) {
    case 'tor':
      return 'tor';
    case 'wireguard':
      return 'vpn';
    case 'byo-socks':
      return 'socks';
    default:
      return 'unknown';
  }
}

/** Proper-noun label for the interstitial's `{tunnel}` placeholder. */
export function tunnelLabel(kind: TunnelKind): string {
  switch (kind) {
    case 'direct':
      return '';
    case 'tor':
      return 'Tor';
    case 'vpn':
      return 'WireGuard';
    case 'socks':
      return 'SOCKS';
    default:
      return 'VPN';
  }
}

function recordPending(wcId: number, entry: PendingHttpsOnly): void {
  pending.delete(wcId);
  pending.set(wcId, entry);
  while (pending.size > PENDING_CAP) {
    const oldest = pending.keys().next();
    if (oldest.done) break;
    pending.delete(oldest.value);
  }
}

/** The live pending record for a webContents, or `undefined` once its TTL passed. */
export function getPendingHttpsOnly(wcId: number): PendingHttpsOnly | undefined {
  const p = pending.get(wcId);
  if (p === undefined) return undefined;
  if (Date.now() - p.ts >= PENDING_TTL_MS) {
    pending.delete(wcId);
    return undefined;
  }
  return p;
}

export function clearPendingHttpsOnly(wcId: number): void {
  pending.delete(wcId);
  tracker.clearOwner(ownerOf(wcId, undefined));
}

/** Loop-guard owner: the tab when the request has one, else the partition (service workers). */
function ownerOf(wcId: number | undefined, partition: string | undefined): string {
  return wcId !== undefined ? `wc:${String(wcId)}` : `partition:${partition ?? ''}`;
}

/** The host a request is made on behalf of: itself for the main frame, else the tab's top-level page. */
function topLevelHost(details: Electron.OnBeforeRequestListenerDetails): string | null {
  const raw =
    details.resourceType === 'mainFrame'
      ? details.url
      : details.webContentsId === undefined
        ? null
        : (webContents.fromId(details.webContentsId)?.getURL() ?? null);
  if (raw === null) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function handle(
  details: Electron.OnBeforeRequestListenerDetails,
  partition: string,
): Electron.CallbackResponse | undefined {
  const kind = tunnelKindOfPartition(partition);
  const prefs = PreferenceStore.getAll();
  if (!(kind === 'direct' ? prefs.httpsFirstEverywhere : prefs.httpsOnlyOnTunnel)) return undefined;
  // An unparseable URL would be waved through by the pure core; here it throws and so fails closed.
  const requestHost = normalizeHost(new URL(details.url).hostname);
  const top = topLevelHost(details);
  const owner = ownerOf(details.webContentsId, partition);
  const decision = decide({
    url: details.url,
    method: details.method,
    resourceType: details.resourceType,
    tunnelKind: kind,
    enabled: true,
    // A bypass covers the host the user clicked through for — not third parties its page happens to load.
    bypassed:
      top !== null &&
      isHttpsOnlyBypassed(partition, top) &&
      (details.resourceType === 'mainFrame' || requestHost === normalizeHost(top)),
    recentlyUpgraded: tracker.has(owner, details.url),
  });
  if (decision.action === 'allow') return undefined;
  const mainFrame = details.resourceType === 'mainFrame';
  if (mainFrame) {
    if (decision.action === 'upgrade') tracker.record(owner, details.url);
    if (details.webContentsId !== undefined) {
      recordPending(details.webContentsId, {
        host: requestHost,
        httpUrl: details.url,
        reason: decision.action === 'upgrade' ? 'upgraded' : decision.reason,
        ts: Date.now(),
      });
    }
  }
  return decision.action === 'upgrade' ? { redirectURL: decision.url } : { cancel: true };
}

export function httpsOnlyHandler(
  details: Electron.OnBeforeRequestListenerDetails,
  ctx?: BeforeRequestContext,
): Electron.CallbackResponse | undefined {
  // Cheapest checks first: this runs for every request in every session.
  if (!/^(?:http|ws):/i.test(details.url)) return undefined;
  const partition = ctx?.partition;
  if (partition === undefined) return undefined;
  const tunneled = isTunneledPartition(partition);
  // A Direct session is only ever touched for a top-level GET navigation, and that test is cheap — so the
  // (copying) preference read below is never paid for the page's sub-resources.
  if (!tunneled && !(details.resourceType === 'mainFrame' && details.method === 'GET')) {
    return undefined;
  }
  try {
    return handle(details, partition);
  } catch (err: unknown) {
    if (!tunneled) {
      // The everywhere mode is a convenience, not a containment: if it cannot decide, the page loads.
      Logger.warn('HTTPS-first handler failed; letting the request through', { err: String(err) });
      return undefined;
    }
    Logger.warn('HTTPS-only handler failed; cancelling on a tunnel partition', {
      err: String(err),
    });
    return { cancel: true };
  }
}

/** Register the handler with the web-request multiplexer. Call before any tab can load. */
export function registerHttpsOnly(): () => void {
  return BrowsingWebRequestService.onBeforeRequest(HANDLER_ID, httpsOnlyHandler);
}

export function resetHttpsOnlyForTests(): void {
  bypassed.clear();
  pending.clear();
  tracker = new UpgradeTracker();
}
