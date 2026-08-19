import { z } from 'zod';
import { AiTaskEnum, RiskLevelEnum } from './enums';

/**
 * MCP tool naming: {domain}_{verb}_{noun}, approved verb vocabulary only
 * (MCP_Server_Design_Rules). Enforced both for the internal registry and the exposed MCP server.
 */
export const ToolNameSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*_(list|get|search|create|update|delete|upload|download|analyze|translate|export|validate)_[a-z][a-z0-9]*$/,
    'Tool name must be {domain}_{verb}_{noun} using an approved verb',
  );
export type ToolName = z.infer<typeof ToolNameSchema>;

/** Where a tool comes from — all sources look identical to the agent (uniform tool plane, plan §10).
 *  `extension` = an in-process capability contributed by a built-in extension (ADR-0021), distinct
 *  from `mcp` (an out-of-process stdio server declared via `manifest.mcpServer`, ADR-0018). */
export const ToolSourceEnum = z.enum(['builtin', 'mcp', 'skill', 'adapter', 'prompt', 'extension']);
export type ToolSource = z.infer<typeof ToolSourceEnum>;

/** Normalized tool descriptor registered in the Capability Plane (L5). */
export const ToolDescriptorSchema = z.object({
  id: ToolNameSchema,
  description: z.string().min(1),
  dangerClass: RiskLevelEnum,
  source: ToolSourceEnum,
  /** JSON Schema for the tool input (kept opaque here; validated at the gateway). */
  inputSchema: z.unknown(),
  /** create/upload-style tools must carry an idempotency key (exactly-once-ish). */
  requiresIdempotencyKey: z.boolean().default(false),
  /**
   * Code-execution class, for a tool that runs MODEL-AUTHORED code (S5).
   *
   * Declared by the tool author on the descriptor rather than supplied per call, because a caller
   * that could name its own class could name the harmless one. Absent for every ordinary tool.
   * `code_exec_write` is reserved and denied by the kernel in v1.
   */
  capability: z.enum(['code_exec_read', 'code_exec_write']).optional(),
  /** Provenance for trust/marketplace (Ed25519 signer id, etc.). */
  provenance: z.string().optional(),
  /**
   * The LLM/cognitive work this action entails — the axis that decides local-vs-cloud. Optional and
   * fail-safe: absent ⇒ treated as `'none'` (mechanical, no AI step → never "run locally"). See
   * {@link AiTaskEnum}.
   */
  aiTask: AiTaskEnum.optional(),
  /**
   * Whether this action's AI work may run on the on-device model. Absent ⇒ derived from `aiTask`
   * (anything other than `'none'`/absent is local-capable) by consumers; kept optional here so authors
   * can force it off for a cognition-bearing action. Fail-safe: unknown ⇒ not local.
   */
  localCapable: z.boolean().optional(),
  /** Explicit UI group; absent ⇒ consumers derive it from the id's `{domain}` prefix. */
  category: z.string().max(64).optional(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

/** True when an action's AI work can run on the local model: explicit `localCapable`, else derived
 *  from `aiTask` (present and not `'none'`). The single rule shared by the router and the Settings UI. */
export function isLocalCapable(d: Pick<ToolDescriptor, 'aiTask' | 'localCapable'>): boolean {
  return d.localCapable ?? (d.aiTask !== undefined && d.aiTask !== 'none');
}

/** Standard MCP error envelope (MCP_Server_Design_Rules) — no HTTP status, no stack. */
export const ToolErrorCodeEnum = z.enum([
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'TIMEOUT',
  'INTERNAL_ERROR',
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeEnum>;

export const ToolErrorSchema = z.object({
  isError: z.literal(true),
  code: ToolErrorCodeEnum,
  message: z.string(),
  retryable: z.boolean(),
  partial: z.boolean().optional(),
  details: z.unknown().optional(),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;
