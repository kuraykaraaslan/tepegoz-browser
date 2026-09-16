/**
 * SSRF guard — the literal-address half of the defense, living at the ONE outbound-HTTP seam
 * ({@link createHttpClient}) so every caller — `web_get_page`, MCP HTTP transports, future skill
 * endpoints — is covered by construction rather than one call site at a time.
 *
 * `isPublicHttpUrl` rejects a URL whose host is a loopback, private, link-local, ULA, or
 * cloud-metadata address, or a `localhost`-family name. Obfuscated IPv4 (decimal `2130706433`,
 * octal, hex, short-form `127.1`) is handled *for free* by parsing through `new URL()` first — the
 * WHATWG parser normalizes all of those to dotted-quad, so the octet check below sees `127.0.0.1`
 * either way. It is a literal-address check only — a public hostname that *resolves* to a private IP
 * (DNS rebinding) passes it, because it never does DNS. That gap is closed separately, in
 * `createHttpClient`'s resolve-then-pin `lookup` override, which calls {@link isPublicIpLiteral} on
 * the address a real DNS lookup returns and connects to that exact address (no second, re-winnable
 * resolution between the check and the connect).
 *
 * Consumers that want it enforced pass `blockPrivateHosts: true` to {@link createHttpClient}, which
 * installs a request interceptor (refuse before send), a `beforeRedirect` hook (re-check each hop's
 * literal target), and the pinning `lookup` (re-check + pin what DNS actually resolves, on every hop
 * since `follow-redirects` reuses the same request options). `@tepegoz/web-tools` re-exports
 * `isPublicHttpUrl` from here for its zod `.refine` on the `web_get_page` URL (defense in depth + a
 * cleaner error for the agent).
 */

/** Cloud-metadata / internal hostnames that are never a legitimate outbound target. */
const BLOCKED_HOST_NAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return null;
  const parts = m.slice(1, 5).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/** RFC 1918 + loopback + link-local + "this host" + CGNAT + multicast/reserved. */
function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b! >= 16 && b! <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT (RFC 6598)
  if (a! >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(raw: string): boolean {
  const host = raw.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (host === '::1' || host === '::' || host === '0:0:0:0:0:0:0:1') return true;
  // IPv4-mapped / -compatible — `::ffff:1.2.3.4` and Node's normalized `::ffff:hhhh:hhhh` form. These
  // are IPv4-in-IPv6, almost never a legitimate web URL, and their usual purpose is to slip past a v4
  // filter — so the whole `::ffff:` / `::` -embedded space is refused rather than partially decoded.
  if (host.startsWith('::ffff:') || host.startsWith('::0:') || /^::\d/.test(host)) return true;
  const head = host.split(':')[0] ?? '';
  if (head.startsWith('fc') || head.startsWith('fd')) return true; // ULA fc00::/7
  if (
    head.startsWith('fe8') ||
    head.startsWith('fe9') ||
    head.startsWith('fea') ||
    head.startsWith('feb')
  )
    return true; // link-local fe80::/10
  return false;
}

/**
 * `true` when `host` — a bare IPv4 dotted-quad or IPv6 literal, no brackets/scheme/port — is a public
 * address (not loopback/RFC1918/link-local/ULA/CGNAT/multicast/cloud-metadata). A string that is not a
 * recognizable IP literal at all (an ordinary hostname) is also `true` here: this function's other
 * caller is the resolve-then-pin DNS check in `createHttpClient`, which passes it the address a lookup
 * actually resolved to — by construction always an IP literal there, never a bare hostname.
 */
export function isPublicIpLiteral(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  const v4 = ipv4Parts(bare);
  if (v4 !== null) return !isPrivateIpv4(v4);
  if (bare.includes(':')) return !isPrivateIpv6(bare);
  return true;
}

/**
 * `true` when `raw` is an `http(s)` URL whose host is safe to fetch — a public hostname or a public
 * IP literal. Anything unparseable, non-http(s), or targeting a non-public address is `false`.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // Node returns an IPv6 hostname bracketed (`[::1]`); normalize it away for the checks.
  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
  if (host.length === 0) return false;
  if (BLOCKED_HOST_NAMES.has(host) || host.endsWith('.localhost')) return false;
  return isPublicIpLiteral(host);
}
