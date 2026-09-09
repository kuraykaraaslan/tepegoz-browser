import { connect as netConnect } from 'node:net';
import { AppError } from '@tepegoz/libs';
import { currentEgressRoute, type EgressRoute } from '@tepegoz/http';
import { socks5Connect } from '@tepegoz/socks5';
import type { RawDuplex } from '@tepegoz/chat-transport-node';

/**
 * The egress-bound dialer for chat (and, later, mail) — the concrete `NodeTransportPorts.dial` the
 * desktop injects into `NodeChatTransport`. It puts every raw chat socket on the SAME Phase-5
 * binding tab traffic uses, and it is **fail-closed**: a General binding that points at a tunnel
 * which is not currently up refuses the connection rather than falling back to the clear path —
 * exactly `egress-route.ts`'s rule ("silently downgrading to the clear path is the leak").
 *
 * The route decision + SOCKS layering are pure; the `net.connect` primitive is injected so this is
 * unit-tested without a real socket.
 */

export interface ChatDialerDeps {
  /** Resolve the current app-egress route (default: `@tepegoz/http`'s installed policy). */
  route?: () => EgressRoute;
  /** Open a raw TCP connection to `host:port` (default: `node:net`). */
  connectTcp?: (host: string, port: number) => Promise<RawDuplex>;
  /** SOCKS5 handshake timeout. */
  socksTimeoutMs?: number;
}

const SOCKS_TIMEOUT_MS = 15_000;

export function createChatDialer(deps: ChatDialerDeps = {}): (opts: {
  host: string;
  port: number;
}) => Promise<RawDuplex> {
  const route = deps.route ?? currentEgressRoute;
  const connectTcp = deps.connectTcp ?? defaultConnectTcp;
  const socksTimeoutMs = deps.socksTimeoutMs ?? SOCKS_TIMEOUT_MS;

  return async ({ host, port }) => {
    const decision = route();

    if (decision.mode === 'direct') {
      return connectTcp(host, port);
    }

    // A tunnel is in force. Port 0 is `egress-route.ts`'s "cannot honour" value.
    if (decision.socksPort <= 0) {
      throw new AppError('Chat egress refused: the bound connection is not up', 503);
    }

    const proxy = await connectTcp('127.0.0.1', decision.socksPort);
    try {
      await socks5Connect(proxy, { host, port }, { timeoutMs: socksTimeoutMs });
    } catch (err) {
      proxy.destroy();
      const reason = err instanceof Error ? err.message : String(err);
      throw new AppError(`Chat egress refused: SOCKS5 to the bound connection failed (${reason})`, 503);
    }
    return proxy;
  };
}

/* v8 ignore start -- the node:net primitive; the dialer logic above is what is unit-tested. */
function defaultConnectTcp(host: string, port: number): Promise<RawDuplex> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    let closeCb: (err?: Error) => void = () => undefined;
    let fired = false;
    const fireClose = (err?: Error): void => {
      if (fired) return;
      fired = true;
      closeCb(err);
    };
    socket.once('connect', () =>
      resolve({
        write: (data) => void socket.write(data),
        onData: (cb) => socket.on('data', (chunk: Buffer) => cb(new Uint8Array(chunk))),
        onClose: (cb) => {
          closeCb = cb;
        },
        destroy: () => socket.destroy(),
        nodeSocket: socket,
      }),
    );
    socket.once('error', (err) => {
      fireClose(err);
      reject(err);
    });
    socket.on('close', () => fireClose());
    socket.on('end', () => fireClose());
  });
}
/* v8 ignore stop */
