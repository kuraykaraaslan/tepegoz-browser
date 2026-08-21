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

/** A pinned model id, or '' for auto/tiered routing. Membership in the provider's catalog is checked
 *  by the handler (this file must not pull the model-gateway into the contract package). */
const KeyModelSchema = z.string().max(64);

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

/** `credentials:set-model` payload — pins the model ONE key runs with ('' clears the pin). */
export const SetProviderKeyModelSchema = z.object({
  keyId: KeyIdSchema,
  model: KeyModelSchema,
});

/** `credentials:reorder` payload — the full key-id list in the new priority order (top = default). */
export const ReorderKeysSchema = z.object({
  orderedIds: z.array(KeyIdSchema).max(200),
});

/** A content-addressed blob reference (`newtab:get-background-image` payload). */
export const CasRefSchema = z.string().startsWith('cas://').max(128);

/** `auth:basic-respond` payload. Credential fields are length-capped like any other renderer string;
 *  they are forwarded to Chromium and never stored, so nothing here is validated against a vault. */
export const BasicAuthResponseSchema = z.object({
  requestId: z.string().max(64),
  username: z.string().max(1024),
  password: z.string().max(1024),
  cancelled: z.boolean(),
});
