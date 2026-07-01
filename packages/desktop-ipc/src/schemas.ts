import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import { PROVIDER_IDS, type AppInfo } from './contract';

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

const ProviderIdSchema = z.enum(PROVIDER_IDS);

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

export const AgentPlanResponseSchema = z.object({
  planId: z.string().min(1).max(64),
  approved: z.boolean(),
  skipStepIds: z.array(z.string().max(64)).max(100).optional(),
});

export const HistoryQuerySchema = z.string().max(200);
export const HistoryUrlSchema = z.string().min(1).max(4096);

/** `bookmarks:toggle` payload — the page URL + its title (title defaults to the URL if empty). */
export const BookmarkToggleSchema = z.object({
  url: z.string().min(1).max(4096),
  title: z.string().max(2048),
});
/** `bookmarks:is-bookmarked` payload — a single URL to look up. */
export const BookmarkUrlSchema = z.string().min(1).max(4096);

/** `user-agent:set` payload — a UA string to apply, or null to reset to the browser default. */
export const UserAgentSelectionSchema = z.string().max(512).nullable();

/** `extension:popup-open` payload — which extension, and the toolbar icon's rect to anchor under. */
export const ExtensionPopupOpenSchema = z.object({
  id: z.string().regex(EXTENSION_ID_RE).max(128),
  anchor: ContentBoundsSchema,
});
