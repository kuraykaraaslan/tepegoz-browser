/**
 * AI-provider identity — the ONE place the provider union is spelled out. Deliberately zod-free and
 * exported as its own `@tepegoz/shared-types/providers` entry so the desktop IPC contract (imported
 * by the SANDBOXED preload, which must stay dependency-free) can consume it at runtime; `enums.ts`
 * builds the zod validator (`AIProviderEnum`) from this same array.
 */
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

/**
 * The providers the agent runtime has an adapter for and can actually DRIVE today. A key for any
 * provider may be stored, but a run resolves to the highest-priority stored key whose provider is in
 * this set — so a user whose top key is a not-yet-wired provider still runs on a lower-priority
 * supported key instead of hard-failing. The ONE source of truth, shared by the runtime (key
 * selection) and the Settings UI (the "not usable yet" hint). Widen this as providers are wired up
 * (Gemini pending an adapter).
 */
export const RUNNABLE_AI_PROVIDERS = ['anthropic', 'openai'] as const satisfies readonly AIProvider[];

/** True when the agent runtime can drive `provider` today (see {@link RUNNABLE_AI_PROVIDERS}). */
export function isRunnableProvider(provider: AIProvider): boolean {
  return (RUNNABLE_AI_PROVIDERS as readonly AIProvider[]).includes(provider);
}

/** Per-provider "has at least one key stored" flags — NEVER the keys themselves. Shared by the
 *  credential vault (producer, derived from the key collection) and the IPC contract (renderer status). */
export type ProviderKeyStatus = Record<AIProvider, boolean>;

/**
 * Renderer-facing metadata for ONE stored API key. Deliberately carries NO secret: `last4` is the
 * last four characters of the key (a non-secret fingerprint so the user can tell similar keys apart),
 * captured when the key is added. The ciphertext lives only in the main-process vault and never
 * crosses IPC. Zod-free / preload-safe (imported at runtime by the sandboxed preload), like the rest
 * of this module. The zod validator (if needed) is built from this shape in `enums.ts`.
 */
export interface ProviderKeyMeta {
  id: string;
  provider: AIProvider;
  label: string;
  /** Epoch millis when the key was added; also the tiebreaker for "first key for a provider". */
  createdAt: number;
  /** Last four characters of the key — a non-secret fingerprint. May be '' for legacy-migrated keys. */
  last4: string;
}
