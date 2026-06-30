import { z } from 'zod';
import type { AppInfo } from './ipc-contract';

/**
 * Runtime (zod) validation for IPC payloads — MAIN PROCESS ONLY. Kept separate from `ipc-contract.ts`
 * so the sandboxed preload never pulls zod into its bundle (sandboxed preloads can't require external
 * modules at runtime). Validates the UNTRUSTED direction: inputs arriving from the renderer.
 */
export const AppInfoSchema: z.ZodType<AppInfo> = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
});

const ProviderIdSchema = z.enum(['anthropic', 'openai', 'gemini']);

/** `credentials:set` payload — the only channel that carries a raw key (renderer → main). */
export const SetProviderKeyInputSchema = z.object({
  provider: ProviderIdSchema,
  apiKey: z.string().min(1).max(500),
});

export const RemoveProviderKeyInputSchema = z.object({
  provider: ProviderIdSchema,
});

export const ContentBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const TabIdSchema = z.string().min(1).max(64);
export const NavigateInputSchema = z.string().max(4096);
export const CreateTabInputSchema = z.string().max(4096).optional();
export const ContentVisibleSchema = z.boolean();

/** `agent:run` prompt (renderer → main). The agent treats this as the user's trusted intent. */
export const AgentRunInputSchema = z.string().min(1).max(4000);
export const AgentRunIdSchema = z.string().min(1).max(64);
export const AgentApprovalResponseSchema = z.object({
  approvalId: z.string().min(1).max(64),
  approved: z.boolean(),
});
