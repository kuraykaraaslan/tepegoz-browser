import { z } from 'zod';

/**
 * The normalized MCP server config the supervisor consumes, regardless of source (user preferences or
 * an extension manifest declaration). Validated at the boundary (zod). Only `stdio` is wired in the
 * Phase-1a desktop transport; `http_sse` is accepted by the schema (forward-compat) but the transport
 * factory throws until Phase 1b.
 */
export const McpServerConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(64),
    transport: z.enum(['stdio', 'http_sse']),
    command: z.string().min(1).max(1024).optional(),
    args: z.array(z.string().max(1024)).max(64).default([]),
    env: z.record(z.string().max(4096)).default({}),
    url: z.string().url().max(2048).optional(),
    enabled: z.boolean().default(true),
    source: z.enum(['prefs', 'extension']),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.transport === 'stdio' && (cfg.command === undefined || cfg.command.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stdio requires "command"',
        path: ['command'],
      });
    }
    if (cfg.transport === 'http_sse' && cfg.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'http_sse requires "url"',
        path: ['url'],
      });
    }
  });

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** Runtime connection state for one server (feeds the read-only Settings status list + journal). */
export type McpServerState = 'idle' | 'connecting' | 'ready' | 'error';

export interface McpServerStatus {
  id: string;
  label: string;
  transport: McpServerConfig['transport'];
  state: McpServerState;
  toolCount: number;
  error?: string;
}
