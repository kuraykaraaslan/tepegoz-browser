import { z } from 'zod';

/**
 * Zod re-validation of everything the MCP SDK returns, BEFORE it crosses into our registry. The SDK is
 * a transport/framing convenience — it is never our trust boundary (ADR-0018). External servers are
 * untrusted, so `tools/list` and `tools/call` results are `safeParse`d here.
 */

/** MCP tool behavioural hints (advisory, server-controlled — never trusted for safety, see danger.ts). */
export const McpToolAnnotationsSchema = z
  .object({
    title: z.string().optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  })
  .passthrough();
export type McpToolAnnotations = z.infer<typeof McpToolAnnotationsSchema>;

export const McpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  /** JSON Schema (opaque here; compiled by validator.ts). */
  inputSchema: z.unknown(),
  annotations: McpToolAnnotationsSchema.optional(),
});
export type McpTool = z.infer<typeof McpToolSchema>;

export const McpToolListSchema = z.object({
  tools: z.array(McpToolSchema),
  nextCursor: z.string().optional(),
});

/** A single content block of a tool result (only `text` is consumed in 1a; others pass through). */
export const McpContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

export const McpToolResultSchema = z
  .object({
    content: z.array(McpContentBlockSchema).optional(),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
  })
  .passthrough();
export type McpToolResult = z.infer<typeof McpToolResultSchema>;
