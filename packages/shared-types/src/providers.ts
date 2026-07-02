/**
 * AI-provider identity — the ONE place the provider union is spelled out. Deliberately zod-free and
 * exported as its own `@tepegoz/shared-types/providers` entry so the desktop IPC contract (imported
 * by the SANDBOXED preload, which must stay dependency-free) can consume it at runtime; `enums.ts`
 * builds the zod validator (`AIProviderEnum`) from this same array.
 */
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

/** Per-provider "is a key stored" flags — NEVER the keys themselves. Shared by the credential vault
 *  (producer) and the IPC contract (renderer-facing status). */
export type ProviderKeyStatus = Record<AIProvider, boolean>;
