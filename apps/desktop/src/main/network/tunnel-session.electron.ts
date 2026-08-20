import { type Session, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { isValidConnectionId, partitionKeyFor } from '@tepegoz/tab-engine';
import {
  assertFailClosed,
  proxyResolutionIsTunneled,
  tunnelProxyConfig,
  BLACKHOLE_PROXY_CONFIG,
  TUNNEL_WEBRTC_POLICY,
} from '@tepegoz/security-policy';
import BrowsingSessions from './browsing-sessions.electron';

/**
 * The single Electron call site that puts a browsing session behind a tunnel (Phase 5, L0/L8).
 *
 * Everything upstream of here is a decision: `resolveBinding` picks the connection, `partitionKeyFor`
 * names the partition, `tunnelProxyConfig`/`assertFailClosed` state what a non-leaking configuration
 * looks like. This is where those decisions become a live `session.setProxy`, and the reason it is one
 * function is that every leak in a feature like this comes from a SECOND path to the network that
 * skipped one of the checks.
 *
 * It is `async` and it verifies, rather than assuming:
 *
 * - `setProxy` resolving means Chromium accepted the rules, not that it applies them to a given URL. So
 *   the bind is only complete once `resolveProxy()` reports a SOCKS route for an ordinary https URL. If
 *   it reports `DIRECT`, the bind throws — a session that answers DIRECT is a tunnel in name only, and
 *   handing it back would put a tab that believes it is tunneled on the clear path.
 * - A throw here must never be caught into "fall back to Direct". The caller's only correct responses
 *   are to leave the tab where it is or to show the failure; falling back IS the leak.
 *
 * NOT handled here, and deliberately not pretended otherwise: this configures egress for a session, it
 * does not create the tunnel. `socksPort` is supplied by a connection in the pool (a userspace WireGuard
 * bridge, a Tor SOCKS port) — the pool and its providers are still to be built. What this means today is
 * that the wiring is real and testable against ANY local SOCKS endpoint, including the one the
 * `spike-tunnel-failclosed` e2e stands up, without waiting on a shipped native binary.
 */

/** A rules lookup, not a network request — `.invalid` can never resolve, which is the point. */
const PROXY_PROBE_URL = 'https://tepegoz-proxy-probe.invalid/';

/** Partitions whose proxy has been applied AND verified, so a re-bind is cheap. */
const verified = new Set<string>();

export interface TunnelBind {
  connectionId: string;
  partition: string;
  session: Session;
}

/**
 * Bind (or re-confirm) the session for one connection, fully wired and verified.
 *
 * Ordering matters and is not incidental: the session is created through `BrowsingSessions` FIRST, so
 * the filtering/quarantine/User-Agent plane is attached before any proxy exists to carry traffic — never
 * the other way round, which would leave a window where the partition can reach the network with no
 * ad-blocking, no download quarantine and the wrong User-Agent.
 */
export async function ensureTunnelSession(
  connectionId: string,
  socksPort: number,
): Promise<TunnelBind> {
  if (!isValidConnectionId(connectionId)) {
    throw new Error(`Refusing to bind an invalid connection id: ${JSON.stringify(connectionId)}`);
  }
  const partition = partitionKeyFor({ connectionId });
  // Throws if a critical attacher could not attach — a session we cannot filter is one no tab may use.
  const ses = BrowsingSessions.ensure(partition);

  if (verified.has(partition)) return { connectionId, partition, session: ses };

  const config = tunnelProxyConfig(socksPort);
  assertFailClosed(config);
  await ses.setProxy(config);

  const resolved = await ses.resolveProxy(PROXY_PROBE_URL);
  if (!proxyResolutionIsTunneled(resolved)) {
    Logger.error('Tunnel bind refused: the session still resolves to a non-SOCKS route', {
      connectionId,
      partition,
      resolved,
    });
    throw new Error(
      `Tunnel bind for ${connectionId} did not take effect (resolveProxy reported "${resolved}")`,
    );
  }

  verified.add(partition);
  Logger.info('Tunnel session bound', { connectionId, partition, resolved });
  return { connectionId, partition, session: ses };
}

/**
 * Per-`WebContents` hardening for a tab hosted on a tunnel partition.
 *
 * Session-level proxy rules cover the network stack's TCP requests; WebRTC is the hole they do not
 * cover, because it opens UDP straight from the host's network stack and a SOCKS proxy carries TCP. A
 * page in a "tunneled" tab could therefore hand out the machine's real local and public addresses in ICE
 * candidates while every HTTP request went through the tunnel. This is applied per `WebContents` because
 * that is the only scope Electron exposes the policy on.
 */
export function applyTunnelHardening(wc: WebContents): void {
  try {
    wc.setWebRTCIPHandlingPolicy(TUNNEL_WEBRTC_POLICY);
  } catch (err) {
    // Not swallowed silently: a tab whose WebRTC policy did not stick is a tab that can leak its real
    // address, and the caller must be able to treat that as a failed bind.
    Logger.error('Failed to harden WebRTC for a tunneled tab', { err: String(err) });
    throw err;
  }
}

/** Forget the verification cache (tests, and a connection torn down and rebuilt on a new port). */
export function invalidateTunnelVerification(connectionId: string): void {
  if (!isValidConnectionId(connectionId)) return;
  verified.delete(partitionKeyFor({ connectionId }));
}

/**
 * Point a connection's partition back at the blackhole, immediately, and forget its verification.
 *
 * Called the instant a connection goes down. A dead SOCKS port already fails closed — but only for as
 * long as it stays dead: local ports are recycled, and an unrelated process that later binds the same
 * loopback port would inherit a browser partition pointing straight at it. That is a stranger in the
 * middle of traffic the user believes is tunneled, so "the port is dead" is not a durable enough
 * guarantee to rest on.
 *
 * Blackholing instead makes the down state independent of what else happens on the machine, and forcing
 * re-verification on the way back up means recovery cannot skip the `resolveProxy` check.
 *
 * Never throws: this runs on a health-poll callback, and a failure to blackhole must be logged loudly
 * rather than allowed to take down the poll that noticed the drop in the first place.
 */
export async function blackholeTunnelSession(connectionId: string): Promise<void> {
  if (!isValidConnectionId(connectionId)) return;
  const partition = partitionKeyFor({ connectionId });
  verified.delete(partition);
  try {
    const ses = BrowsingSessions.ensure(partition);
    await ses.setProxy(BLACKHOLE_PROXY_CONFIG);
    Logger.info('Tunnel partition blackholed after a drop', { connectionId, partition });
  } catch (err) {
    Logger.error('Could not blackhole a dropped tunnel partition', {
      connectionId,
      partition,
      err: String(err),
    });
  }
}

export function resetTunnelSessionsForTests(): void {
  verified.clear();
}
