/**
 * XMPP connection discovery (RFC 6120 §3.2 + XEP-0156). Pure: DNS SRV lookup and the
 * `.well-known/host-meta` fetch are injected, so this is testable against fixtures and stays
 * Node-free. Produces an ordered list of connection candidates the adapter tries in turn.
 */

export interface SrvRecord {
  target: string;
  port: number;
  priority: number;
  weight: number;
}

export interface DiscoveryPorts {
  /** Resolve DNS SRV records for a name (e.g. `_xmpp-client._tcp.example.com`); `[]` if none. */
  resolveSrv(name: string): Promise<SrvRecord[]>;
  /** GET a URL as text, or `null` on any failure (DNS, TLS, non-2xx). */
  getText(url: string): Promise<string | null>;
}

export type ConnectionCandidate =
  | { kind: 'tcp'; host: string; port: number; tls: boolean }
  | { kind: 'websocket'; url: string };

const DEFAULT_STARTTLS_PORT = 5222;
const DEFAULT_TLS_PORT = 5223;

/** SRV records sorted per RFC 2782: lower priority first, then higher weight (weight ordering within
 *  a priority is a randomised draw in a real resolver; here it is deterministic by weight desc so
 *  fixtures are stable). */
export function sortSrv(records: readonly SrvRecord[]): SrvRecord[] {
  return [...records].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
}

function isNoService(records: readonly SrvRecord[]): boolean {
  // RFC 2782: a single record with target "." means "the service is decidedly not available".
  return records.length === 1 && records[0]?.target === '.';
}

/**
 * Discover connection candidates for an XMPP domain, most-preferred first:
 * 1. `_xmpps-client._tcp` SRV (direct TLS),
 * 2. `_xmpp-client._tcp` SRV (STARTTLS),
 * 3. host-meta `urn:xmpp:alt-connections:websocket` links,
 * 4. the A record on the domain (STARTTLS, port 5222) as a last resort.
 */
export async function discoverXmpp(
  domain: string,
  ports: DiscoveryPorts,
): Promise<ConnectionCandidate[]> {
  const candidates: ConnectionCandidate[] = [];

  const [tlsSrv, startTlsSrv] = await Promise.all([
    ports.resolveSrv(`_xmpps-client._tcp.${domain}`).catch(() => [] as SrvRecord[]),
    ports.resolveSrv(`_xmpp-client._tcp.${domain}`).catch(() => [] as SrvRecord[]),
  ]);

  if (!isNoService(tlsSrv)) {
    for (const r of sortSrv(tlsSrv)) {
      candidates.push({ kind: 'tcp', host: r.target, port: r.port, tls: true });
    }
  }
  if (!isNoService(startTlsSrv)) {
    for (const r of sortSrv(startTlsSrv)) {
      candidates.push({ kind: 'tcp', host: r.target, port: r.port, tls: false });
    }
  }

  for (const url of await discoverWebSocketEndpoints(domain, ports)) {
    candidates.push({ kind: 'websocket', url });
  }

  if (candidates.length === 0) {
    candidates.push({ kind: 'tcp', host: domain, port: DEFAULT_STARTTLS_PORT, tls: false });
  }
  return candidates;
}

/** XEP-0156: read alt-connection WebSocket endpoints from `.well-known/host-meta{,.json}`. */
export async function discoverWebSocketEndpoints(
  domain: string,
  ports: DiscoveryPorts,
): Promise<string[]> {
  const REL = 'urn:xmpp:alt-connections:websocket';

  const json = await ports.getText(`https://${domain}/.well-known/host-meta.json`);
  if (json !== null) {
    try {
      const parsed = JSON.parse(json) as { links?: Array<{ rel?: string; href?: string }> };
      const urls = (parsed.links ?? [])
        .filter((l) => l.rel === REL && typeof l.href === 'string')
        .map((l) => l.href as string)
        .filter(isSecureWs);
      if (urls.length > 0) return urls;
    } catch {
      /* fall through to XRD */
    }
  }

  const xml = await ports.getText(`https://${domain}/.well-known/host-meta`);
  if (xml === null) return [];
  const urls: string[] = [];
  for (const m of xml.matchAll(/<Link\b[^>]*>/g)) {
    const tag = m[0];
    if (!tag.includes(REL)) continue;
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (href !== undefined && isSecureWs(href)) urls.push(href);
  }
  return urls;
}

function isSecureWs(url: string): boolean {
  return url.startsWith('wss://');
}

/** The default candidates when the caller has explicit server settings (skip discovery). */
export function explicitCandidate(opts: {
  host: string;
  port: number | null;
  security: 'tls' | 'starttls';
}): ConnectionCandidate {
  const tls = opts.security === 'tls';
  return {
    kind: 'tcp',
    host: opts.host,
    port: opts.port ?? (tls ? DEFAULT_TLS_PORT : DEFAULT_STARTTLS_PORT),
    tls,
  };
}
