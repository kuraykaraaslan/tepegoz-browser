import { z } from 'zod';
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
  glassAvailable: z.boolean(),
});

const ProviderIdSchema = z.enum(PROVIDER_IDS);
/** A stored-key id (generated uuid). Bounded to keep the untrusted payload small. */
const KeyIdSchema = z.string().min(1).max(128);

/** `credentials:add` payload — the only channel that carries a raw key (renderer → main). */
export const AddProviderKeyInputSchema = z.object({
  provider: ProviderIdSchema,
  label: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(500),
});

/** `credentials:remove-by-id` payload. */
export const RemoveKeyByIdSchema = z.object({
  keyId: KeyIdSchema,
});

/** `credentials:rename` payload (label only — the secret is never touched). */
export const RenameProviderKeyInputSchema = z.object({
  keyId: KeyIdSchema,
  label: z.string().min(1).max(64),
});

/** `credentials:reorder` payload — the full key-id list in the new priority order (top = default). */
export const ReorderKeysSchema = z.object({
  orderedIds: z.array(KeyIdSchema).max(200),
});

/** A content-addressed blob reference (`newtab:get-background-image` payload). */
export const CasRefSchema = z.string().startsWith('cas://').max(128);
