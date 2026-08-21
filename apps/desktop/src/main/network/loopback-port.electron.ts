import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { probeSocksPort } from './connection-provider.electron';

/**
 * Loopback port plumbing shared by the userspace providers (Phase 5).
 *
 * Each provider needs a free port to put its SOCKS listener on, and needs to know when that listener is
 * actually answering. Both are small, both are easy to get subtly wrong, and both are used identically by
 * WireGuard and Tor — so they live here rather than being written twice.
 */

/**
 * A loopback port that is free right now.
 *
 * Ask the OS for an ephemeral port and immediately give it back, then hand the number to the provider.
 * There is a race in principle — something else could take it in between — and it is accepted rather than
 * papered over: the alternative (holding the socket open and passing the descriptor) is not something the
 * helper binaries accept. The window is microseconds, and a provider that loses the race fails to bind
 * and reports down, which is a visible, recoverable outcome rather than a silent one.
 *
 * Bound to 127.0.0.1 explicitly, never 0.0.0.0: a SOCKS proxy reachable from the network would let anyone
 * on the LAN use the user's tunnel.
 */
export async function reserveLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Wait until a loopback SOCKS port accepts connections.
 *
 * `hasDied` lets the caller abort the moment its child process exits, which turns "the tunnel could not
 * start" from a full timeout into an immediate, specific failure — and lets the caller surface the
 * process's own error message instead of a generic one.
 */
export async function waitForSocksPort(
  port: number,
  timeoutMs: number,
  hasDied: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (hasDied()) throw new Error('the process exited before its listener came up');
    if (await probeSocksPort(port, 500)) return;
    if (Date.now() > deadline)
      throw new Error(`no listener on 127.0.0.1:${String(port)} after ${String(timeoutMs)}ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
