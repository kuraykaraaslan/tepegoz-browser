import { ConnectionHealthSchema, type ConnectionHealth } from '@tepegoz/shared-types';

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
