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

/**
 * What the partition is bound to. `'direct'` is not a tunnel at all: it is the HTTPS-first-everywhere mode
 * applied to an ordinary (or private) window, which follows Chrome's HTTPS-First model rather than the
 * tunnel's fail-closed one — main-frame GET navigations only, local-network hosts exempt, and never
 * cancelling a request (a form POST or a WebSocket to an `http:` site is left to the page).
 */
export type TunnelKind = 'tor' | 'vpn' | 'socks' | 'unknown' | 'direct';
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

/**
 * A host that is on the user's own network, where HTTPS is rarely available (a router, a NAS, a printer, a
 * dev box): dotless names, the usual private suffixes, and private/link-local address literals. A public
 * address literal is NOT local. Only the direct mode exempts these — a tunnel's proxy refuses them anyway.
 */
export function isLocalNetworkHost(host: string): boolean {
  if (!host.includes('.') && !host.includes(':')) return true; // dotless: `printer`, `nas`
  if (/\.(local|localhost|internal|lan|intranet|corp|home|home\.arpa)$/.test(host)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (host.includes(':')) return /^(f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/.test(host); // ULA, link-local
  return false;
}

export function isExemptHost(hostname: string, kind: TunnelKind): boolean {
  const host = normalizeHost(hostname);
  if (isLoopbackHost(host)) return true;
  if (kind === 'direct') return isLocalNetworkHost(host);
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
  const method = input.method.toUpperCase();
  const mainFrame = input.resourceType === 'mainFrame';
  // Direct mode only ever upgrades a top-level GET navigation: sub-resources are the browser's
  // mixed-content business, and cancelling a POST or a WebSocket on the open web would break forms.
  if (input.tunnelKind === 'direct' && (u.protocol === 'ws:' || method !== 'GET' || !mainFrame)) {
    return ALLOW;
  }
  if (u.protocol === 'ws:') return { action: 'cancel', reason: 'ws' };

  if (method !== 'GET') return { action: 'cancel', reason: 'non-get' };
  if (mainFrame && input.recentlyUpgraded) return { action: 'cancel', reason: 'loop' };
  return { action: 'upgrade', url: upgradeUrl(input.url) };
}

interface TrackerEntry {
  at: number;
}

/**
 * Loop guard: remembers (owner, exact http URL) we just upgraded, for a short TTL. The owner is one tab
 * (its webContents), so the same link opened twice in a partition is not mistaken for a redirect loop;
 * the entries for a tab are dropped when its navigation commits or stops.
 */
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

  /** Drop every entry recorded for `owner` (the navigation ended; nothing is in flight any more). */
  clearOwner(owner: string): void {
    const prefix = `${owner}\u0000`;
    for (const k of this.entries.keys()) {
      if (k.startsWith(prefix)) this.entries.delete(k);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export type LoadFailureClass = 'offer-bypass' | 'ignore' | 'no-bypass';

// -100 (connection closed) is what a server that does not speak TLS on :443 does — measured end to end
// against a plain-HTTP origin in `e2e/https-only-tunnel.spec.ts`, where it was missing and left the user
// on Chromium's raw error page. A tunnel that dies mid-handshake looks the same, which is why the
// tunnel-down check runs before this list is consulted.
// -120/-121 are the SOCKS5 client's "connect failed / host unreachable": how a refused :443 looks when
// the tunnel is a local SOCKS endpoint (Tor, wireproxy, BYO-SOCKS) rather than a direct connection.
const OFFER_BYPASS = new Set([-100, -102, -101, -107, -118, -120, -121, -324]);

/** Closed allowlist: an unknown code can only cost the user Chromium's plain error page. */
export function classifyLoadFailure(errorCode: number): LoadFailureClass {
  if (errorCode === -3) return 'ignore';
  if (OFFER_BYPASS.has(errorCode)) return 'offer-bypass';
  return 'no-bypass';
}
