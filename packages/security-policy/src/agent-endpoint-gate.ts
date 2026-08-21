import type { AgentEndpointToken, RiskLevel } from '@tepegoz/shared-types';
import { isSensitiveSite } from './sensitive-site';

/**
 * Governed Agent Endpoints (Phase 9, L5/L8/L9) — the gate an inbound MCP/A2A call passes through before
 * anything else. The phase's own framing is exact: this is the productized inverse of every OUTBOUND
 * capability check elsewhere in this codebase, so it reuses the parts of that machinery that mean the
 * same thing from either direction rather than re-deriving them.
 *
 * The one property that makes this safe to expose to an external caller at all: **`isSensitiveSite`
 * applies regardless of what the token says.** A Bearer token is, structurally, exactly the kind of
 * artifact that could be minted wrong, leaked, or replayed — treating it as more trustworthy than an
 * interactive session on a bank/health/password-manager site would make the endpoint feature strictly
 * more dangerous than the browser it is bolted onto, which defeats the entire point of building it as a
 * *governed* endpoint rather than a plain one.
 */

export type AgentEndpointDenialReason =
  | 'expired'
  | 'revoked'
  | 'sensitive_site_lockout'
  | 'tool_not_allowed'
  | 'danger_class_not_allowed'
  | 'unresolvable_target';

export type AgentEndpointVerdict =
  { allowed: true } | { allowed: false; reason: AgentEndpointDenialReason };

export interface AgentEndpointRequest {
  toolId: string;
  dangerClass: RiskLevel;
  /** The URL this call targets, when the tool is site-scoped. Omitted for a tool with no target (e.g. a
   *  pure computation) — the sensitive-site check simply does not apply to those. */
  targetUrl?: string;
}

/**
 * May this inbound call proceed?
 *
 * Fail-closed at every branch, and the sensitive-site check runs BEFORE the token's own scope checks —
 * a token that would otherwise cover the call is still refused on a locked-out site, because the lockout
 * is a property of the SITE, not something a token's own contents can be scoped around.
 */
export function tokenCovers(
  token: AgentEndpointToken,
  request: AgentEndpointRequest,
  opts: { now?: number; revoked?: boolean } = {},
): AgentEndpointVerdict {
  const now = opts.now ?? Date.now();
  if (opts.revoked === true) return { allowed: false, reason: 'revoked' };
  if (token.expiresAt <= now) return { allowed: false, reason: 'expired' };
  if (request.targetUrl !== undefined && isSensitiveSite(request.targetUrl)) {
    return { allowed: false, reason: 'sensitive_site_lockout' };
  }
  if (!token.allowedToolIds.includes(request.toolId)) {
    return { allowed: false, reason: 'tool_not_allowed' };
  }
  if (!token.allowedDangerClasses.includes(request.dangerClass)) {
    return { allowed: false, reason: 'danger_class_not_allowed' };
  }
  return { allowed: true };
}

/**
 * A per-token sliding-window rate limit, evaluated over the calls already recorded — a caller supplies
 * its own call log (from wherever it journals inbound calls) rather than this module owning any state,
 * so the same pure check works whether it is asked once per call or replayed against history for an
 * audit.
 */
export function withinRateLimit(
  limitPerMinute: number,
  recentCallTimestamps: readonly number[],
  now: number = Date.now(),
): boolean {
  const windowStart = now - 60_000;
  const inWindow = recentCallTimestamps.filter((ts) => ts > windowStart && ts <= now).length;
  return inWindow < limitPerMinute;
}
