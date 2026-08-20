import { createServer, connect, type Server, type Socket } from 'node:net';
import { Resolver } from 'node:dns/promises';
import type { AddressInfo } from 'node:net';
import { Logger } from '@tepegoz/libs';

/**
 * A SOCKS5 front door for a layer-3 tunnel (Phase 5, the OpenVPN path).
 *
 * WireGuard and Tor hand us a SOCKS port of their own. OpenVPN does not — it brings up a TUN adapter and
 * expects the operating system's routing table to do the rest, which for a per-tab VPN is exactly wrong:
 * a route is machine-wide, and we want one tab group tunneled and everything else untouched.
 *
 * So this server is the bridge. It speaks SOCKS5 to Chromium, and every socket it opens outward is bound
 * to the tunnel adapter's own address. Under Windows' strong host model that constrains the route lookup
 * to that interface, where the tunnel's own high-metric default route is waiting.
 *
 * Two properties it must hold, and both are the kind that fail silently if wrong:
 *
 * 1. **Never an unbound socket.** A connection opened without `localAddress` takes the physical default
 *    route — the traffic works, so nothing looks broken, and it has left on the clear path.
 * 2. **Never the system resolver.** Chromium hands us hostnames (SOCKS5 remote DNS), and resolving them
 *    with the machine's resolver would send the user's browsing list to their ISP while the traffic
 *    itself went through the tunnel. Names are resolved with a resolver bound to the tunnel address and
 *    pointed at the tunnel's own DNS, and a failure returns a SOCKS error rather than falling back.
 *
 * IPv6 is refused outright on an IPv4 tunnel for the same reason: an AAAA answer would be reached over
 * the physical IPv6 path, outside the tunnel entirely.
 */

/** SOCKS5 reply codes used here. */
const REPLY_OK = 0x00;
const REPLY_GENERAL_FAILURE = 0x01;
const REPLY_HOST_UNREACHABLE = 0x04;
const REPLY_CMD_UNSUPPORTED = 0x07;
const REPLY_ADDR_UNSUPPORTED = 0x08;

const AUTH_NONE = Buffer.from([0x05, 0x00]);
/** How long a name may take to resolve through the tunnel before the request is failed. */
const RESOLVE_TIMEOUT_MS = 5_000;
/** How long an outbound connect may take. */
const CONNECT_TIMEOUT_MS = 15_000;

function reply(code: number): Buffer {
  return Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
}

interface Target {
  host: string;
  port: number;
  /** True when the client gave a name rather than an address — the case that needs tunnel DNS. */
  isName: boolean;
}

/** Parse a SOCKS5 CONNECT request. Returns null for anything this server will not serve. */
export function parseSocksRequest(req: Buffer): { target: Target | null; code: number } {
  if (req.length < 7 || req[0] !== 0x05) return { target: null, code: REPLY_GENERAL_FAILURE };
  if (req[1] !== 0x01) return { target: null, code: REPLY_CMD_UNSUPPORTED }; // CONNECT only
  const atyp = req[3];
  if (atyp === 0x01) {
    if (req.length < 10) return { target: null, code: REPLY_GENERAL_FAILURE };
    return {
      target: { host: `${req[4]}.${req[5]}.${req[6]}.${req[7]}`, port: req.readUInt16BE(8), isName: false },
      code: REPLY_OK,
    };
  }
  if (atyp === 0x03) {
    const len = req[4] ?? 0;
    if (req.length < 5 + len + 2) return { target: null, code: REPLY_GENERAL_FAILURE };
    return {
      target: { host: req.subarray(5, 5 + len).toString('utf8'), port: req.readUInt16BE(5 + len), isName: true },
      code: REPLY_OK,
    };
  }
  // IPv6 literal: refused, not proxied. Reaching it would mean leaving over the physical v6 path.
  return { target: null, code: REPLY_ADDR_UNSUPPORTED };
}

export interface BoundSocksServer {
  port: number;
  close(): Promise<void>;
}

export interface BoundSocksOptions {
  /** The tunnel adapter's own address. Every outbound socket is bound to it. */
  localAddress: string;
  /** Resolvers reachable inside the tunnel (the server's pushed `dhcp-option DNS`). */
  dnsServers: readonly string[];
}

/**
 * Start a SOCKS5 server on loopback whose egress is pinned to `localAddress`.
 *
 * Refuses to start without a DNS server: with none, every hostname would have to be resolved by the
 * machine's own resolver, which is the leak this whole file exists to prevent. Better to have no
 * connection than a connection that quietly announces where it is going.
 */
export async function startBoundSocksServer(options: BoundSocksOptions): Promise<BoundSocksServer> {
  if (options.dnsServers.length === 0) {
    throw new Error(
      'This tunnel pushed no DNS server. Without a resolver inside it, every site name would be looked ' +
        'up on the normal connection, so the tunnel would hide the traffic but not where it is going.',
    );
  }

  const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT_MS, tries: 2 });
  resolver.setServers([...options.dnsServers]);
  // The queries themselves go out the tunnel too — a resolver bound to the physical address would be
  // asking the tunnel's private DNS over the clear path, which usually just fails, but not always.
  resolver.setLocalAddress(options.localAddress);

  const open = new Set<Socket>();

  const server: Server = createServer((client) => {
    open.add(client);
    client.on('close', () => open.delete(client));
    client.on('error', () => client.destroy());
    client.setTimeout(CONNECT_TIMEOUT_MS, () => client.destroy());

    client.once('data', (greeting) => {
      if (greeting[0] !== 0x05) {
        client.destroy();
        return;
      }
      client.write(AUTH_NONE);
      client.once('data', (raw) => {
        const { target, code } = parseSocksRequest(raw);
        if (target === null) {
          client.end(reply(code));
          return;
        }
        void openUpstream(target).then(
          (upstream) => {
            open.add(upstream);
            upstream.on('close', () => open.delete(upstream));
            client.write(reply(REPLY_OK));
            client.setTimeout(0);
            client.pipe(upstream);
            upstream.pipe(client);
          },
          () => {
            // No fallback of any kind. A name we could not resolve inside the tunnel, or a host we could
            // not reach through it, is an error the page sees — never a retry on the clear path.
            client.end(reply(REPLY_HOST_UNREACHABLE));
          },
        );
      });
    });
  });

  async function openUpstream(target: Target): Promise<Socket> {
    // A name is resolved through the tunnel; an address is used as given. Either way the socket below is
    // bound, so the route lookup is constrained to the tunnel's interface.
    const host = target.isName ? await resolveInTunnel(target.host) : target.host;
    return new Promise<Socket>((resolve, reject) => {
      const socket = connect({
        host,
        port: target.port,
        localAddress: options.localAddress,
        family: 4,
      });
      const fail = (err: unknown): void => {
        socket.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error('upstream connect timed out')));
      socket.once('connect', () => {
        socket.setTimeout(0);
        resolve(socket);
      });
      socket.once('error', fail);
    });
  }

  async function resolveInTunnel(name: string): Promise<string> {
    // A records only. An AAAA answer would be reached over the physical IPv6 path, entirely outside the
    // tunnel — a leak that looks exactly like the site working.
    const addresses = await resolver.resolve4(name);
    const first = addresses[0];
    if (first === undefined) throw new Error(`no A record for ${name} inside the tunnel`);
    return first;
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Loopback only: a SOCKS proxy reachable from the network would let anyone on the LAN use the tunnel.
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  Logger.info('Bound SOCKS server listening', { port, localAddress: options.localAddress });

  return {
    port,
    async close(): Promise<void> {
      for (const socket of open) socket.destroy();
      open.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
