import { connect, type Socket } from 'node:net';
import { Logger } from '@tepegoz/libs';
import { isValidSocksPort } from '@tepegoz/security-policy';

/**
 * What a network-privacy connection must be able to do, and the one provider that can do it today.
 *
 * The phase specifies three provider families: BYO WireGuard config, account-based (Mullvad/Proton), and
 * Tor. All three end in the same place — **a SOCKS5 endpoint on loopback** — and all three require
 * shipping a native binary that opens a listener, which is gated on Phase 0's unfinished code-signing.
 *
 * So the seam is defined here in terms of that endpoint, and the first provider is the one that needs no
 * binary at all: **bring your own local SOCKS**. A privacy-minded user very often already has one running
 * — Tor Browser's 9050, a VPN client's local SOCKS, `ssh -D`, a userspace WireGuard bridge they installed
 * themselves. Pointing at it is a real, shippable, testable feature today, and it is the same seam the
 * bundled providers will implement later, so nothing built on top of this has to be rewritten for them.
 *
 * A provider owns liveness, not policy: it says whether its endpoint is answering. Whether a tab is
 * ALLOWED to use it is `killSwitchVerdicts`' job, and the two are kept apart on purpose — a provider that
 * could also decide "allowed" would be a provider that could decide "allowed" wrongly.
 */

export interface NetworkPrivacyProvider {
  /** Stable discriminator recorded in config and shown in the UI. */
  readonly kind: 'byo-socks';
  /** Bring the connection up, returning the loopback SOCKS5 port it listens on. */
  connect(): Promise<{ socksPort: number }>;
  disconnect(): Promise<void>;
  /** Is the endpoint answering RIGHT NOW? Used by the pool's health poll. Never throws. */
  probe(): Promise<boolean>;
}

/** How long a health probe waits before calling the endpoint dead. */
const PROBE_TIMEOUT_MS = 2_000;

/**
 * Can something accept a TCP connection on this loopback port right now?
 *
 * A connect-and-close, not a SOCKS handshake, and that is a deliberate limit worth stating: it proves the
 * endpoint is listening, not that the tunnel behind it still reaches the internet. A SOCKS5 endpoint whose
 * upstream died usually stops accepting or starts refusing CONNECTs, and the request-level failure is
 * caught by the fail-closed proxy config anyway — a dead upstream produces an error, never a clear-path
 * request. So this is the cheap liveness signal, and the proxy configuration remains the actual guarantee.
 */
export async function probeSocksPort(port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  if (!isValidSocksPort(port)) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (alive: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(alive);
    };
    const socket: Socket = connect({ port, host: '127.0.0.1' });
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * A connection that points at a SOCKS5 endpoint the user already runs on this machine.
 *
 * Loopback only, and not as a convenience: a REMOTE SOCKS address would mean handing traffic to a third
 * party in a form they can read, which is a different product from the one this phase describes. The same
 * rule is enforced again at the proxy-configuration boundary (`assertFailClosed`), so a mistake here
 * cannot become a live route.
 */
export class ByoSocksProvider implements NetworkPrivacyProvider {
  readonly kind = 'byo-socks' as const;

  constructor(private readonly socksPort: number) {
    if (!isValidSocksPort(socksPort)) {
      throw new Error(`Not a usable SOCKS port: ${String(socksPort)}`);
    }
  }

  async connect(): Promise<{ socksPort: number }> {
    const alive = await probeSocksPort(this.socksPort);
    if (!alive) {
      // Refusing here rather than reporting "up" and letting the first page load fail is the difference
      // between a user who knows their Tor daemon is not running and one who thinks they are anonymous.
      throw new Error(`Nothing is listening on 127.0.0.1:${String(this.socksPort)}`);
    }
    Logger.info('BYO SOCKS connection is answering', { socksPort: this.socksPort });
    return { socksPort: this.socksPort };
  }

  async disconnect(): Promise<void> {
    // Nothing to tear down: the endpoint belongs to the user, not to us. Stopping their Tor daemon
    // because they unbound a tab would be the browser reaching outside its own process for no reason.
    return Promise.resolve();
  }

  probe(): Promise<boolean> {
    return probeSocksPort(this.socksPort);
  }
}
