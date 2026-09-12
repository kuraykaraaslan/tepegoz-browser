import { createServer, connect, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

/**
 * A transparent TCP passthrough: everything written to a client that connects to `port` is piped
 * unmodified to `forwardTo`, and vice versa. Exists so an e2e test can simulate "the network
 * dropped" against a REAL server (Prosody) that must otherwise stay up and keep its session state
 * — the passthrough's pipe is what gets killed, not the server, and not the listener, so a
 * reconnect through the SAME `port` reaches the SAME real server again.
 *
 * Deliberately dumber than `socks5-test-server.ts`: no protocol handshake at all, since the
 * client here (the real XMPP TLS/STARTTLS stream) must see bytes completely untouched.
 */
export interface TcpPassthrough {
  port: number;
  /** Destroy every currently-piped connection (both ends) without closing the listener — the
   *  "network drop": existing sockets die, but a NEW connection attempt on `port` still works. */
  dropAll(): void;
  close(): Promise<void>;
}

export async function startTcpPassthrough(forwardTo: {
  host: string;
  port: number;
}): Promise<TcpPassthrough> {
  const live = new Set<Socket>();

  const server: Server = createServer((client) => {
    const upstream = connect(forwardTo.port, forwardTo.host, () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
    live.add(client);
    live.add(upstream);
    const forget = (s: Socket): void => {
      live.delete(s);
    };
    client.on('close', () => forget(client));
    upstream.on('close', () => forget(upstream));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  return {
    port: (server.address() as AddressInfo).port,
    dropAll(): void {
      for (const s of live) s.destroy();
      live.clear();
    },
    async close(): Promise<void> {
      for (const s of live) s.destroy();
      live.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
