import { z } from 'zod';
import { RiskLevelEnum } from './enums';

/**
 * A Governed Agent Endpoint's scoped Bearer token (Phase 9, productized inbound MCP/A2A). Everything an
 * external caller may ever do through this token is enumerated here — there is no "and whatever else the
 * minting profile allows" field, because a token whose ceiling is defined by a mutable reference to
 * something else can grow after the fact without anyone editing the token itself.
 */
export const AgentEndpointTokenSchema = z.object({
  id: z.string().uuid(),
  /** Tool ids this token may ever invoke. Empty means the token can call nothing — never "everything". */
  allowedToolIds: z.array(z.string().min(1).max(100)),
  /** Danger classes this token may invoke, independent of which tools it lists — a token scoped to
   *  `['read']` cannot call an allowed tool that turns out to classify as `state_changing` on its actual
   *  arguments, exactly like the interactive Policy Kernel already re-classifies per call rather than
   *  trusting a tool's declared class alone. */
  allowedDangerClasses: z.array(RiskLevelEnum).min(1),
  expiresAt: z.number().int().positive(),
  /** Requests per rolling 60s window. Absent means "no explicit limit set on this token" — a caller of
   *  `withinRateLimit` must still supply SOME limit; there is no code path where "unset" is read as
   *  "unlimited" by this schema alone. */
  rateLimitPerMinute: z.number().int().positive().optional(),
});
export type AgentEndpointToken = z.infer<typeof AgentEndpointTokenSchema>;
