import type { LiveConnectionStatus, SlowCause } from '@tepegoz/shared-types';

/**
 * "'Slow' needs a cause, not a spinner" (Phase 5, L9 onboarding-&-health). A tunnelled tab can feel slow
 * for reasons the user cannot tell apart from a spinner alone — relay latency, a still-bootstrapping
 * bridge, the exit site pushing back, or the tunnel itself half-down — and the Tor complaint corpus this
 * phase is built against names that ambiguity as what turns a slow session into an abandoned product.
 *
 * This module attributes it, from signals the connection pool already tallies
 * (`ConnectionPool`/`PoolConnectionView` in `apps/desktop/src/main/network/connection-pool.electron.ts`):
 * live status, the health-poll heartbeat, and the session's drop/reconnect counts. It is PURE — no I/O,
 * no clock reads, no pool access — the caller resolves "now" and passes already-measured deltas, which is
 * what makes this trivially unit-testable and keeps it out of the connection pool's own trust-critical
 * connect/health-poll/kill-switch path entirely. Nothing here can change how a tunnel connects, is probed,
 * or fails closed; it only reads a snapshot of what has already happened.
 *
 * **Honest gap, stated rather than papered over:** the phase doc also names "HTTP status class from the
 * exit" (2xx/3xx/4xx/5xx) as a signal to attribute `exit_blocked_by_site` from. `recentExitStatusClass`
 * is accepted below so that branch is real and independently testable, but nothing in this codebase
 * tallies a per-connection response-status history today — adding that (a new `webRequest.onCompleted`
 * observer keyed by session partition) is genuinely new measurement plumbing, and out of this task's
 * explicit scope ("do not invent new measurement plumbing"). The production wiring
 * (`apps/desktop/src/main/ipc/ipc-network.ts`) therefore always passes `null` for it today, same as this
 * phase's other stated-not-wired seams (e.g. `egress-route.ts`'s `setTunnelAgentFactory`). `4xx` is
 * reachable now only from a test calling this function directly, until something produces the signal.
 */

/** The four RFC 7231 status-code classes a response can fall into, or `null` when nothing recent has been
 *  observed from the exit (today: always `null` in production — see the module doc above). */
export type HttpStatusClass = '2xx' | '3xx' | '4xx' | '5xx';

export interface SlowCauseSignals {
  /** The connection's live status right now. `connecting` is never a fault by itself — see below. */
  status: LiveConnectionStatus;
  /** Milliseconds since the health poll last heard from this connection (`now - lastCheckedAt`), or
   *  `null` when it has never been probed this session. A stalled/never value is itself a signal: the
   *  pool's own doc for `lastCheckedAt` says a stalled value means the poll stopped. */
  msSinceLastHealthCheck: number | null;
  /** Times this connection has dropped from `up` this session (`PoolConnectionView.drops`). */
  drops: number;
  /** Times this connection has come back `up` after having been up earlier this session
   *  (`PoolConnectionView.reconnects`). */
  reconnects: number;
  /** Most recent HTTP response status class observed on a request egressing through this connection, or
   *  `null` when nothing has been observed. See the module doc: not wired to a live producer today. */
  recentExitStatusClass: HttpStatusClass | null;
}

/** >= this many drops OR reconnects this session counts as "flapping", not merely "recovered once". */
const FLAP_THRESHOLD = 2;

/** A health poll older than this (health-interval-ish, chosen independently of the pool's own 15s
 *  interval so this module has no compile-time coupling to it) reads as stalled rather than merely due. */
const STALE_HEALTH_CHECK_MS = 45_000;

/**
 * Attribute one cause from the signals above. Always returns exactly one of {@link SlowCause}'s members —
 * never throws, never returns two candidates for the caller to pick between.
 *
 * **Priority, and why.** Health problems are checked BEFORE anything else, including while the tunnel is
 * still nominally `up`: a connection that is simultaneously slow and unhealthy (flapping, or its poll has
 * gone stale) is reported as `tunnel_degraded`, never `relay_latency` — "the relay is just slow" is the
 * wrong thing to tell a user whose tunnel is actually failing, and it is the more actionable of the two
 * explanations regardless of which one a raw timing signal might have suggested. `relay_latency` is
 * reached only once every fault signal this function checks has been ruled out — it is the leftover
 * explanation once health, bootstrap, and exit-side signals all come back clean, not a default guess.
 */
export function classifySlowCause(signals: SlowCauseSignals): SlowCause {
  const { status, msSinceLastHealthCheck, drops, reconnects, recentExitStatusClass } = signals;

  // 1. Down outright, or flapping (repeated drops/reconnects this session): the tunnel itself is the
  //    problem. This branch is checked first and wins over every other signal — see the doc above.
  if (status === 'down') return 'tunnel_degraded';
  if (drops >= FLAP_THRESHOLD || reconnects >= FLAP_THRESHOLD) return 'tunnel_degraded';

  // 2. Still establishing. A pending handshake reads as bootstrap-shaped, not "the page is loading
  //    slowly" — there is no page traffic to be slow yet.
  if (status === 'connecting') return 'bridge_or_bootstrap';

  // From here, status === 'up' and the connection has not flapped this session.

  // 3. The health poll has gone quiet on a connection nominally up. Distinguish "never checked yet"
  //    (genuinely ambiguous — it may simply have just come up) from "was checked before, has since gone
  //    stale" (the poll itself looks stopped, which is a degraded-tunnel signal on its own).
  if (msSinceLastHealthCheck === null) return 'insufficient_signal';
  if (msSinceLastHealthCheck > STALE_HEALTH_CHECK_MS) return 'tunnel_degraded';

  // 4. The tunnel is confirmed healthy. A challenge-shaped (4xx) response from the exit, with the
  //    connection itself clean, points at the SITE reacting to the exit address, not the connection.
  if (recentExitStatusClass === '4xx') return 'exit_blocked_by_site';

  // 5. Ordinary or absent exit signal, tunnel confirmed healthy: the one honest explanation left for
  //    "feels slow" is the tunnel's own relay overhead.
  if (recentExitStatusClass === '2xx' || recentExitStatusClass === '3xx') return 'relay_latency';
  if (recentExitStatusClass === null) return 'relay_latency';

  // 5xx: a server-side error at the destination is not something this feature caused or can explain
  // either way. Attributing it to the tunnel would be exactly the false confidence this module refuses.
  return 'insufficient_signal';
}
