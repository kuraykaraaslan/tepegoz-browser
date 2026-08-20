/**
 * The proxy configuration a tunnel-bound session is allowed to run with (Phase 5, L8).
 *
 * This module is pure and Electron-free on purpose — it is the place where "fail-closed" is a checkable
 * property of a value rather than a claim about a code path. `killSwitchVerdicts` decides WHETHER a tab
 * may egress; this decides what its session's egress configuration must look like for that verdict to
 * mean anything.
 *
 * Three ways a per-tab VPN silently becomes no VPN at all, each closed by an assertion below:
 *
 * 1. **A `DIRECT` fallback in the proxy rules.** Chromium reads `socks5://127.0.0.1:1080,DIRECT` as
 *    "try the tunnel, and if it is not answering, go out the clear path" — which is precisely the silent
 *    fallback the phase forbids. Without a fallback the same dead tunnel yields
 *    `ERR_PROXY_CONNECTION_FAILED` and nothing leaves the machine. Fail-closed here is not extra
 *    machinery; it is the *absence* of one token, which is exactly why it needs a test that would fail
 *    if someone helpfully added it back.
 * 2. **SOCKS4 instead of SOCKS5.** SOCKS4 has no hostname form, so Chromium resolves the name locally
 *    first and the user's ISP/resolver sees every site they visit through the "private" tunnel. Only
 *    `socks5://` (which Chromium maps to SOCKS5-with-remote-DNS) is accepted.
 * 3. **A too-broad bypass list.** Every bypassed host is a clear-path request. Loopback is bypassed
 *    because our own IPC and localhost development must not be tunneled; nothing else is — notably NOT
 *    Chromium's `<local>` (dotless hostnames), which would send `http://intranet/` out the clear path
 *    and hand a LAN host the user's real address.
 */

/**
 * The ONLY hosts a tunneled session may reach without the tunnel. Loopback literals only: the phase's
 * "IPC + localhost dev are never tunneled" requirement, and not one host wider.
 */
export const TUNNEL_BYPASS_RULES = 'localhost;127.0.0.1;[::1]';

/**
 * WebRTC's IP-handling policy for a tunneled `WebContents`.
 *
 * WebRTC opens UDP directly from the host's network stack, and a SOCKS proxy carries TCP — so a page
 * that starts an RTCPeerConnection inside a "tunneled" tab hands out the machine's real local and public
 * addresses through ICE candidates, past a proxy that never saw the packets. `disable_non_proxied_udp`
 * is the only value that refuses those candidates outright rather than merely preferring the proxy.
 */
export const TUNNEL_WEBRTC_POLICY = 'disable_non_proxied_udp';

/** Shaped to Electron's `Session.setProxy` input, without importing Electron into a pure package. */
export interface TunnelProxyConfig {
  mode: 'fixed_servers';
  proxyRules: string;
  proxyBypassRules: string;
}

export type ProxyRejectionReason =
  | 'not_fixed_servers'
  | 'empty_rules'
  | 'direct_fallback'
  | 'not_socks5'
  | 'not_loopback'
  | 'bad_port'
  | 'bypass_too_broad';

export class UnsafeProxyConfigError extends Error {
  constructor(readonly reason: ProxyRejectionReason, detail: string) {
    super(`Refusing an unsafe tunnel proxy config (${reason}): ${detail}`);
    this.name = 'UnsafeProxyConfigError';
  }
}

/** A local SOCKS port must be a real, non-privileged, dynamically-assignable TCP port. */
export function isValidSocksPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * The proxy configuration for a connection whose local SOCKS5 endpoint listens on `port`.
 *
 * Always loopback: the SOCKS endpoint is a process on this machine (a userspace WireGuard bridge, a Tor
 * SOCKS port). Pointing a session at a REMOTE proxy address would send traffic to a third party in
 * cleartext-to-them form, which is a different product than the one this phase describes.
 */
export function tunnelProxyConfig(port: number): TunnelProxyConfig {
  if (!isValidSocksPort(port)) {
    throw new UnsafeProxyConfigError('bad_port', String(port));
  }
  return {
    mode: 'fixed_servers',
    // No `,DIRECT` — see (1) above. This single missing token is the kill-switch.
    proxyRules: `socks5://127.0.0.1:${port}`,
    proxyBypassRules: TUNNEL_BYPASS_RULES,
  };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Throw unless this configuration cannot leak. Called immediately before `setProxy` at the one Electron
 * call site, so a hand-written or future generated config is checked by the same rules as
 * {@link tunnelProxyConfig}'s output — the assertion is the contract, not the constructor.
 */
export function assertFailClosed(config: TunnelProxyConfig): void {
  if (config.mode !== 'fixed_servers') {
    throw new UnsafeProxyConfigError('not_fixed_servers', config.mode);
  }
  const rules = config.proxyRules.trim();
  if (rules.length === 0) throw new UnsafeProxyConfigError('empty_rules', '(empty)');

  const entries = rules.split(/[,;]/).map((e) => e.trim()).filter((e) => e.length > 0);
  for (const entry of entries) {
    if (/^direct$/i.test(entry)) {
      throw new UnsafeProxyConfigError('direct_fallback', rules);
    }
    // Chromium also accepts `scheme=proxy` per-scheme rules; take the right-hand side.
    const server = entry.includes('=') ? entry.slice(entry.indexOf('=') + 1).trim() : entry;
    if (/^direct$/i.test(server)) {
      throw new UnsafeProxyConfigError('direct_fallback', rules);
    }
    if (!server.toLowerCase().startsWith('socks5://')) {
      throw new UnsafeProxyConfigError('not_socks5', server);
    }
    const hostPort = server.slice('socks5://'.length);
    const sep = hostPort.lastIndexOf(':');
    const host = sep === -1 ? hostPort : hostPort.slice(0, sep);
    const port = sep === -1 ? NaN : Number(hostPort.slice(sep + 1));
    if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
      throw new UnsafeProxyConfigError('not_loopback', host);
    }
    if (!isValidSocksPort(port)) throw new UnsafeProxyConfigError('bad_port', String(port));
  }

  const bypass = config.proxyBypassRules
    .split(';')
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  for (const rule of bypass) {
    if (!LOOPBACK_HOSTS.has(rule)) {
      throw new UnsafeProxyConfigError('bypass_too_broad', rule);
    }
  }
}

/**
 * Does what Electron's `session.resolveProxy()` reports prove the tunnel is actually in force?
 *
 * The post-condition on `setProxy`, and worth having as its own check: `setProxy` resolving does not
 * mean Chromium adopted the rules for a given URL, and a session that quietly answers `DIRECT` for
 * `https://example.com` is a tunnel in name only. `DIRECT` — the literal Chromium returns when no proxy
 * applies — is the one answer that must abort the bind.
 */
export function proxyResolutionIsTunneled(resolved: string): boolean {
  const first = resolved.split(/[;,]/)[0]?.trim().toUpperCase() ?? '';
  return first.startsWith('SOCKS5 ') || first.startsWith('SOCKS ');
}
