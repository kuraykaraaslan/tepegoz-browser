/**
 * HTTPS-only policy core for tunnel-bound partitions (Phase 5).
 *
 * Electron-free and synchronous so it can be table-tested. The Electron seam (the onBeforeRequest
 * handler, the interstitial, the bypass set) lives elsewhere and only feeds this module facts.
 *
 * Policy: on a tunnel, cleartext must never reach the exit. `http:` is upgraded to `https:`, `ws:` is
 * cancelled. Only loopback (and `.onion` on Tor) is exempt: private, LAN and dotless hosts are NOT,
 * because the tunnel proxy is deny-by-default for them and cleartext must never leave.
 */

export type TunnelKind = 'tor' | 'vpn' | 'socks' | 'unknown';
export type CancelReason = 'non-get' | 'ws' | 'loop';

export type HttpsOnlyDecision =
  | { action: 'allow' }
  | { action: 'upgrade'; url: string }
  | { action: 'cancel'; reason: CancelReason };

export interface HttpsOnlyInput {
  url: string;
  method: string;
  resourceType: string;
  tunnelKind: TunnelKind;
  enabled: boolean;
  bypassed: boolean;
  recentlyUpgraded: boolean;
}

const ALLOW: HttpsOnlyDecision = { action: 'allow' };

/** Lowercase, strip brackets of IPv6 literals and ONE trailing dot. */
export function normalizeHost(hostname: string): string {
  let h = hostname.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export function isExemptHost(hostname: string, kind: TunnelKind): boolean {
  const host = normalizeHost(hostname);
  if (isLoopbackHost(host)) return true;
  return kind === 'tor' && host.endsWith('.onion');
}

/** Rewrite http: to https:. :80 becomes the default port; any other port is kept verbatim. */
export function upgradeUrl(url: string): string {
  const u = new URL(url);
  const port = u.port;
  u.protocol = 'https:';
  // Per the URL spec, switching a special scheme keeps a non-default port and drops the default one;
  // an explicit :80 would survive as :80, so clear it by hand.
  if (port === '80') u.port = '';
  return u.href;
}

export function decide(input: HttpsOnlyInput): HttpsOnlyDecision {
  let u: URL;
  try {
    u = new URL(input.url);
  } catch {
    return ALLOW;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'ws:') return ALLOW;
  if (!input.enabled || input.bypassed) return ALLOW;
  if (isExemptHost(u.hostname, input.tunnelKind)) return ALLOW;
  if (u.protocol === 'ws:') return { action: 'cancel', reason: 'ws' };

  const method = input.method.toUpperCase();
  const mainFrame = input.resourceType === 'mainFrame';
  if (method !== 'GET') return { action: 'cancel', reason: 'non-get' };
  if (mainFrame && input.recentlyUpgraded) return { action: 'cancel', reason: 'loop' };
  return { action: 'upgrade', url: upgradeUrl(input.url) };
}

interface TrackerEntry {
  at: number;
}

/** Loop guard: remembers (partition, exact http URL) we just upgraded, for a short TTL. */
export class UpgradeTracker {
  private readonly entries = new Map<string, TrackerEntry>();

  constructor(
    private readonly ttlMs = 10_000,
    private readonly cap = 500,
    private readonly now: () => number = Date.now,
  ) {}

  private key(partition: string, url: string): string {
    const hashAt = url.indexOf('#');
    return `${partition}\u0000${hashAt === -1 ? url : url.slice(0, hashAt)}`;
  }

  private prune(): void {
    const t = this.now();
    for (const [k, e] of this.entries) {
      if (t - e.at >= this.ttlMs) this.entries.delete(k);
      else break; // insertion order is time order
    }
  }

  has(partition: string, url: string): boolean {
    const k = this.key(partition, url);
    const e = this.entries.get(k);
    if (!e) return false;
    if (this.now() - e.at >= this.ttlMs) {
      this.entries.delete(k);
      return false;
    }
    return true;
  }

  record(partition: string, url: string): void {
    this.prune();
    const k = this.key(partition, url);
    this.entries.delete(k);
    this.entries.set(k, { at: this.now() });
    while (this.entries.size > this.cap) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export type LoadFailureClass = 'offer-bypass' | 'ignore' | 'no-bypass';

const OFFER_BYPASS = new Set([-102, -101, -107, -118, -324]);

/** Closed allowlist: an unknown code can only cost the user Chromium's plain error page. */
export function classifyLoadFailure(errorCode: number): LoadFailureClass {
  if (errorCode === -3) return 'ignore';
  if (OFFER_BYPASS.has(errorCode)) return 'offer-bypass';
  return 'no-bypass';
}
