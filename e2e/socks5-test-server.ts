import { createServer, connect, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

/**
 * A minimal SOCKS5 CONNECT server, for proving what the browser actually puts on the wire.
 *
 * Phase 5's DoD asks for an automated leak test, and the phase file records that one "cannot exist until
 * `session.setProxy` wiring lands". This is the other half of removing that blocker: the wiring needs
 * *a* local SOCKS endpoint to point at, not specifically a shipped WireGuard/Tor binary. Standing one up
 * in-process makes the fail-closed and remote-DNS properties testable today, offline, with no native
 * dependency and no code-signing.
 *
 * Deliberately not a real proxy: no authentication, no BIND/UDP-ASSOCIATE, CONNECT only, and every
 * connection is forwarded to one fixed address regardless of what was requested — which is exactly what
 * makes it a *detector*. A request that arrives here is provably tunneled; one that reaches the forward
 * target by any other route is provably not.
 */

export interface SocksRequest {
  /** SOCKS5 address type: 1 = IPv4, 3 = DOMAINNAME, 4 = IPv6. `3` is the proof of remote DNS. */
  atyp: number;
  host: string;
  port: number;
}

export interface TestSocksServer {
  port: number;
  /** Every CONNECT this server was asked for, in order. */
  requests: SocksRequest[];
  close(): Promise<void>;
}

const AUTH_NONE = Buffer.from([0x05, 0x00]);
// VER=5, REP=succeeded, RSV, ATYP=IPv4, BND.ADDR=0.0.0.0, BND.PORT=0.
const GRANTED = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

function parseRequest(req: Buffer): SocksRequest | null {
  if (req.length < 7 || req[0] !== 0x05 || req[1] !== 0x01) return null; // SOCKS5 CONNECT only
  const atyp = req[3] ?? 0;
  if (atyp === 0x01) {
    if (req.length < 10) return null;
    return { atyp, host: `${req[4]}.${req[5]}.${req[6]}.${req[7]}`, port: req.readUInt16BE(8) };
  }
  if (atyp === 0x03) {
    const len = req[4] ?? 0;
    if (req.length < 5 + len + 2) return null;
    return {
      atyp,
      host: req.subarray(5, 5 + len).toString('utf8'),
      port: req.readUInt16BE(5 + len),
    };
  }
  if (atyp === 0x04) {
    if (req.length < 22) return null;
    return { atyp, host: '[ipv6]', port: req.readUInt16BE(20) };
  }
  return null;
}

export async function startSocks5(forwardTo: {
  host: string;
  port: number;
}): Promise<TestSocksServer> {
  const requests: SocksRequest[] = [];
  const openSockets = new Set<Socket>();

  const server: Server = createServer((client) => {
    openSockets.add(client);
    client.on('close', () => openSockets.delete(client));
    client.on('error', () => client.destroy());

    // Chromium sends the greeting, waits for our method reply, and only then sends the CONNECT request,
    // so the two can never arrive coalesced in one `data` event.
    client.once('data', (greeting) => {
      if (greeting[0] !== 0x05) {
        client.destroy();
        return;
      }
      client.write(AUTH_NONE);
      client.once('data', (raw) => {
        const parsed = parseRequest(raw);
        if (parsed === null) {
          client.destroy();
          return;
        }
        requests.push(parsed);
        const upstream = connect(forwardTo.port, forwardTo.host, () => {
          client.write(GRANTED);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        openSockets.add(upstream);
        upstream.on('close', () => openSockets.delete(upstream));
        upstream.on('error', () => {
          client.destroy();
          upstream.destroy();
        });
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  return {
    port: (server.address() as AddressInfo).port,
    requests,
    async close(): Promise<void> {
      // Destroy live sockets too: "the tunnel dropped" means the endpoint is gone NOW, not once the
      // last keep-alive connection happens to finish.
      for (const s of openSockets) s.destroy();
      openSockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
