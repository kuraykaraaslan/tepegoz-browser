/**
 * WireGuard `.conf` parsing, and rendering it into a wireproxy config (Phase 5).
 *
 * Pure — no Electron, no filesystem — so the part that reads a user-supplied file is unit-testable in
 * isolation. That matters here more than usual: a `.conf` is an untrusted input that ends up configuring
 * where a tab group's traffic goes, and it carries a private key.
 *
 * **The DNS rule is the reason this file exists rather than passing the config through untouched.**
 * wireproxy resolves hostnames itself, using the `DNS` line from the `[Interface]` section. With no `DNS`
 * line it falls back to the host's resolver — which means every hostname the "tunneled" group visits is
 * handed to the user's ISP in the clear, while the traffic itself goes through the tunnel. That is the
 * exact failure this phase exists to prevent, and it is silent. So a config without a usable DNS server
 * is REFUSED here, with a message saying what to add, instead of being quietly accepted.
 */

export interface WireGuardPeer {
  publicKey: string;
  presharedKey: string | null;
  endpoint: string;
  allowedIps: string[];
  persistentKeepalive: number | null;
}

export interface WireGuardConfig {
  privateKey: string;
  /** Interface addresses (`10.2.0.2/32`), in file order. */
  addresses: string[];
  /** Resolvers reachable INSIDE the tunnel. Never empty — see the DNS rule above. */
  dns: string[];
  mtu: number | null;
  peers: WireGuardPeer[];
}

/** What the manager shows about a profile before the user commits to it. No secrets. */
export interface WireGuardSummary {
  endpoint: string;
  addresses: string[];
  dns: string[];
  peerCount: number;
  /** True when the peer routes everything (`0.0.0.0/0`) rather than a subset. */
  fullTunnel: boolean;
}

export class WireGuardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireGuardConfigError';
  }
}

/** WireGuard keys are 32 bytes, base64 — 44 characters ending in `=`. */
const KEY_RE = /^[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]{2}$/;
/** `host:port`, where host is a name or an address (v6 in brackets). */
const ENDPOINT_RE = /^(\[[0-9a-fA-F:]+\]|[^\s:]+):(\d{1,5})$/;

interface Section {
  name: string;
  entries: [string, string][];
}

/** Split an INI-ish WireGuard file into sections, dropping comments and blank lines. */
function sections(text: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    if (line.length === 0) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header !== null) {
      current = { name: (header[1] ?? '').trim().toLowerCase(), entries: [] };
      out.push(current);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1 || current === null) continue; // a stray line outside any section is not a directive
    current.entries.push([line.slice(0, eq).trim().toLowerCase(), line.slice(eq + 1).trim()]);
  }
  return out;
}

function first(section: Section, key: string): string | null {
  for (const [k, v] of section.entries) if (k === key) return v;
  return null;
}

/** Split a comma-separated directive (`Address`, `DNS`, `AllowedIPs`) into trimmed, non-empty parts. */
function list(value: string | null): string[] {
  if (value === null) return [];
  return value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function requireKey(value: string | null, what: string): string {
  if (value === null || value.length === 0) throw new WireGuardConfigError(`${what} is missing`);
  if (!KEY_RE.test(value)) throw new WireGuardConfigError(`${what} is not a valid WireGuard key`);
  return value;
}

/**
 * Parse a WireGuard `.conf`. Throws {@link WireGuardConfigError} with a message meant to be shown to the
 * user — every rejection here is something they can fix in the file.
 */
export function parseWireGuardConfig(text: string): WireGuardConfig {
  if (text.length > 128_000)
    throw new WireGuardConfigError('This file is too large to be a WireGuard config');
  const parsed = sections(text);
  const iface = parsed.find((s) => s.name === 'interface');
  if (iface === undefined) throw new WireGuardConfigError('No [Interface] section found');

  const peers = parsed
    .filter((s) => s.name === 'peer')
    .map((peer): WireGuardPeer => {
      const endpoint = first(peer, 'endpoint');
      if (endpoint === null) throw new WireGuardConfigError('A [Peer] has no Endpoint');
      if (!ENDPOINT_RE.test(endpoint)) {
        throw new WireGuardConfigError(`Endpoint "${endpoint}" is not host:port`);
      }
      const psk = first(peer, 'presharedkey');
      const keepalive = Number(first(peer, 'persistentkeepalive') ?? '');
      return {
        publicKey: requireKey(first(peer, 'publickey'), 'A [Peer] PublicKey'),
        presharedKey: psk === null ? null : requireKey(psk, 'PresharedKey'),
        endpoint,
        allowedIps: list(first(peer, 'allowedips')),
        persistentKeepalive: Number.isInteger(keepalive) && keepalive > 0 ? keepalive : null,
      };
    });
  if (peers.length === 0) throw new WireGuardConfigError('No [Peer] section found');

  const addresses = list(first(iface, 'address'));
  if (addresses.length === 0) throw new WireGuardConfigError('[Interface] has no Address');

  const dns = list(first(iface, 'dns'));
  if (dns.length === 0) {
    // Refused, not defaulted. Picking a resolver for the user would either send their browsing to a third
    // party they did not choose, or (worse) fall through to the host resolver and leak every hostname.
    throw new WireGuardConfigError(
      'This config has no DNS line. Without a resolver inside the tunnel every site name would be ' +
        'looked up on the normal connection, so the tunnel would hide the traffic but not where it is ' +
        'going. Add a "DNS = <server>" line under [Interface].',
    );
  }

  const mtu = Number(first(iface, 'mtu') ?? '');
  return {
    privateKey: requireKey(first(iface, 'privatekey'), '[Interface] PrivateKey'),
    addresses,
    dns,
    mtu: Number.isInteger(mtu) && mtu > 0 ? mtu : null,
    peers,
  };
}

/** The safe-to-display shape: endpoint, addresses, resolvers, and whether it is a full tunnel. */
export function summarize(config: WireGuardConfig): WireGuardSummary {
  const peer = config.peers[0];
  return {
    endpoint: peer?.endpoint ?? '',
    addresses: config.addresses,
    dns: config.dns,
    peerCount: config.peers.length,
    fullTunnel: config.peers.some((p) => p.allowedIps.includes('0.0.0.0/0')),
  };
}

/**
 * Render the wireproxy config that exposes this tunnel as a loopback SOCKS5 endpoint.
 *
 * `AllowedIPs` is forced to `0.0.0.0/0` regardless of what the file said. In kernel WireGuard that field
 * is a routing decision — which destinations go through the tunnel — but here there is no routing table
 * involved: the userspace stack carries whatever the SOCKS server is asked to reach, and a narrower
 * value would silently drop destinations rather than route them elsewhere. Everything reaching this
 * config is already destined for the tunnel, because that is the only reason it exists.
 */
export function toWireproxyConfig(config: WireGuardConfig, socksPort: number): string {
  const lines: string[] = [
    '[Interface]',
    `PrivateKey = ${config.privateKey}`,
    ...config.addresses.map((a) => `Address = ${a}`),
    `DNS = ${config.dns.join(', ')}`,
  ];
  if (config.mtu !== null) lines.push(`MTU = ${String(config.mtu)}`);

  for (const peer of config.peers) {
    lines.push('', '[Peer]', `PublicKey = ${peer.publicKey}`);
    if (peer.presharedKey !== null) lines.push(`PresharedKey = ${peer.presharedKey}`);
    lines.push(`Endpoint = ${peer.endpoint}`, 'AllowedIPs = 0.0.0.0/0');
    if (peer.persistentKeepalive !== null) {
      lines.push(`PersistentKeepalive = ${String(peer.persistentKeepalive)}`);
    }
  }

  lines.push('', '[Socks5]', `BindAddress = 127.0.0.1:${String(socksPort)}`, '');
  return lines.join('\n');
}
