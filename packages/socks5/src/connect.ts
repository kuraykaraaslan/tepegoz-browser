import { Socks5Negotiator, type Socks5Target } from './negotiator';

/** The minimal duplex the connector drives. */
export interface Socks5Socket {
  write(data: Uint8Array): void;
  onData(cb: (chunk: Uint8Array) => void): void;
  onClose(cb: (err?: Error) => void): void;
  destroy(): void;
}

export interface Socks5ConnectOptions {
  /** Fail the handshake if it does not complete within this many ms. */
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

/**
 * Run a SOCKS5 CONNECT over an already-open socket to the proxy. Resolves once the tunnel is
 * established — the same socket then carries the tunneled protocol. Rejects (and destroys the socket)
 * on any handshake failure or timeout.
 */
export function socks5Connect(
  socket: Socks5Socket,
  target: Socks5Target,
  opts: Socks5ConnectOptions = {},
): Promise<void> {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  return new Promise<void>((resolve, reject) => {
    const neg = new Socks5Negotiator(target);
    let settled = false;
    let handshakeData: (chunk: Uint8Array) => void = () => undefined;
    const timer =
      opts.timeoutMs !== undefined
        ? setTimer(() => finish(new Error(`SOCKS5 handshake timed out after ${String(opts.timeoutMs)}ms`)), opts.timeoutMs)
        : null;

    function finish(err?: Error): void {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimer(timer);
      // Detach: further socket data belongs to the tunneled protocol, not us.
      handshakeData = () => undefined;
      if (err !== undefined) {
        socket.destroy();
        reject(err);
      } else {
        resolve();
      }
    }

    handshakeData = (chunk) => {
      const step = neg.feed(chunk);
      if (step.send !== undefined) socket.write(step.send);
      if (step.error !== undefined) finish(new Error(step.error));
      else if (step.done === true) finish();
    };

    socket.onData((chunk) => handshakeData(chunk));
    socket.onClose((err) => finish(err ?? new Error('proxy closed the connection during handshake')));
    socket.write(neg.start());
  });
}
