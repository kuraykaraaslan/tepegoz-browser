import { z } from 'zod';
import { RiskLevelEnum } from './enums';

/**
 * MCP tool naming: {domain}_{verb}_{noun}, approved verb vocabulary only
 * (MCP_Server_Design_Rules). Enforced both for the internal registry and the exposed MCP server.
 */
export const ToolNameSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*_(list|get|search|create|update|delete|upload|download|analyze|export|validate)_[a-z][a-z0-9]*$/,
    'Tool name must be {domain}_{verb}_{noun} using an approved verb',
  );
export type ToolName = z.infer<typeof ToolNameSchema>;

/** Where a tool comes from — all sources look identical to the agent (uniform tool plane, plan §10). */
export const ToolSourceEnum = z.enum(['builtin', 'mcp', 'skill', 'adapter', 'prompt']);
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
  /** Provenance for trust/marketplace (Ed25519 signer id, etc.). */
  provenance: z.string().optional(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

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
