import {
  ConnectionHealthSchema,
  SlowCauseSchema,
  type ConnectionHealth,
  type SlowCause,
} from '@tepegoz/shared-types';

/**
 * The renderer's read of a connection's per-session health (Phase 5: "connection health over time").
 *
 * The health counters ride the same `network:get-state` payload the routing picture uses, which crosses
 * the untrusted-renderer boundary — so it is `safeParse`d here rather than trusted. A record that does
 * not validate (a negative counter, a missing field, a non-number timestamp) yields `null`, and the
 * overview renders "health unavailable" for that row instead of throwing or showing a wrong number.
 */
export function parseConnectionHealth(raw: unknown): ConnectionHealth | null {
  const parsed = ConnectionHealthSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Whole-number percentage of this session's handshakes that succeeded, or `null` when none has been
 * attempted yet (so the overview can say "none attempted" rather than a meaningless 0% or NaN).
 */
export function handshakeSuccessRate(health: ConnectionHealth): number | null {
  const total = health.handshakesOk + health.handshakesFailed;
  if (total === 0) return null;
  return Math.round((health.handshakesOk / total) * 100);
}

/**
 * The renderer's read of a connection's main-computed slow-cause verdict (Phase 5: "'Slow' needs a
 * cause, not a spinner"). `safeParse`d at the same untrusted-renderer boundary as the rest of the health
 * slice: a value that does not validate (a future cause this build does not know, a stray string) yields
 * `null`, and the overview treats that exactly like the classifier's own honest `insufficient_signal` —
 * never a thrown error, never a raw identifier shown to the user.
 */
export function parseSlowCause(raw: unknown): SlowCause | null {
  const parsed = SlowCauseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
