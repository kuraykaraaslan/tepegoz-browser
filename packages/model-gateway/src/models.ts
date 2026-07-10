import type { AIProvider } from '@tepegoz/shared-types';

/**
 * Canonical Anthropic model IDs and effort levels — verified against the `claude-api` reference
 * (SDK @anthropic-ai/sdk 0.107.0). Centralized so the orchestrator and UI reference a single
 * source instead of hardcoding strings.
 *
 * Role assignment per the architecture (docs/ROADMAP §5.6):
 *   - Opus 4.8   → planning (and vision-heavy execution, a later slice)
 *   - Sonnet 4.6 → standard execution
 *   - Haiku 4.5  → cheap classification
 * Compaction is deliberately NOT assigned to Haiku (server-side compaction is unsupported there).
 */
export const ANTHROPIC_MODEL = {
  plan: 'claude-opus-4-8',
  exec: 'claude-sonnet-4-6',
  classify: 'claude-haiku-4-5',
} as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODEL)[keyof typeof ANTHROPIC_MODEL];

/**
 * OpenAI model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router can pick a
 * provider's map by the SAME `plan | exec | classify` key. Mirrors the Anthropic tiering (capable for
 * plan/exec, cheap for classify): `gpt-4o` drives planning AND the reactive exec loop (it must emit the
 * exact decision shape reliably — `gpt-4o-mini` does not), and `gpt-4o-mini` handles cheap classify.
 * These are plain chat models (no `reasoning_effort`), so the OpenAI adapter never sends an effort
 * field. Edit here to retune (e.g. drop exec to `gpt-4o-mini` to cut cost) — the routing LOGIC is
 * provider-agnostic and does not change.
 */
export const OPENAI_MODEL = {
  plan: 'gpt-4o',
  exec: 'gpt-4o',
  classify: 'gpt-4o-mini',
} as const;

export type OpenAIModelId = (typeof OPENAI_MODEL)[keyof typeof OPENAI_MODEL];

/**
 * Google Gemini model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router picks a
 * provider's map by the SAME `plan | exec | classify` key. Mirrors the capable/cheap tiering: `2.5-pro`
 * for planning, `2.5-flash` for the reactive exec loop, `2.5-flash-lite` for cheap classify. These are
 * plain generateContent models (no Anthropic-style effort field); edit here to retune — the routing
 * LOGIC is provider-agnostic and does not change.
 */
export const GEMINI_MODEL = {
  plan: 'gemini-2.5-pro',
  exec: 'gemini-2.5-flash',
  classify: 'gemini-2.5-flash-lite',
} as const;

export type GeminiModelId = (typeof GEMINI_MODEL)[keyof typeof GEMINI_MODEL];

/**
 * Kimi (Moonshot AI) model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router
 * picks a provider's map by the SAME `plan | exec | classify` key. The Kimi API is OpenAI-compatible;
 * `kimi-k2.6` (the current flagship, 256k context) drives planning AND the reactive exec loop, and the
 * cheaper `moonshot-v1-8k` handles classify. These are plain chat models (no effort field). NOTE: the
 * `kimi-k2-*-preview` snapshots were deprecated (2026-05) — use the dotted `kimi-k2.N` line. Edit here
 * to retune — the routing LOGIC is provider-agnostic and does not change.
 */
export const KIMI_MODEL = {
  plan: 'kimi-k2.6',
  exec: 'kimi-k2.6',
  classify: 'moonshot-v1-8k',
} as const;

export type KimiModelId = (typeof KIMI_MODEL)[keyof typeof KIMI_MODEL];

/**
 * On-device (local) tier map. Every tier resolves to the same routing placeholder `LOCAL_SLM_MODEL`
 * (see model-router) — the real GGUF is chosen at run time by the selected catalog model, which
 * `LocalProvider.resolveModel()` maps to a file path. A tiny local model has no meaningful plan/exec/
 * classify split, so one id covers all three.
 */
export const LOCAL_MODEL = {
  plan: 'local-slm',
  exec: 'local-slm',
  classify: 'local-slm',
} as const;

/**
 * `output_config.effort` levels. On Opus 4.8 reasoning depth is controlled HERE — `budget_tokens`
 * is rejected with a 400 and must never be sent. Default (omitted) is server-side `high`; `xhigh`
 * is the sweet spot for coding/agentic work.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** One user-selectable model within a provider (the Agent panel's Model dropdown). */
export interface ProviderModelOption {
  /** Canonical model id sent to the provider — MUST be a value from that provider's tier map above. */
  id: string;
  /** Friendly display name for the picker, e.g. "Opus 4.8". */
  label: string;
}

/**
 * Per-provider list of user-selectable models for the Agent panel's Model dropdown. The ids are read
 * straight from each provider's tier map (single source — they can't drift), so this exposes exactly the
 * models the runtime already knows how to drive. When the user pins one it overrides ALL tiers for the
 * run (see {@link ModelGateway.setModelOverride}). `local` is intentionally empty: the on-device provider
 * has its own downloaded-model selection (Settings → Local models), not a fixed cloud catalog.
 */
export const PROVIDER_MODEL_CATALOG: Record<AIProvider, readonly ProviderModelOption[]> = {
  anthropic: [
    { id: ANTHROPIC_MODEL.plan, label: 'Opus 4.8' },
    { id: ANTHROPIC_MODEL.exec, label: 'Sonnet 4.6' },
    { id: ANTHROPIC_MODEL.classify, label: 'Haiku 4.5' },
  ],
  openai: [
    { id: OPENAI_MODEL.plan, label: 'GPT-4o' },
    { id: OPENAI_MODEL.classify, label: 'GPT-4o mini' },
  ],
  gemini: [
    { id: GEMINI_MODEL.plan, label: 'Gemini 2.5 Pro' },
    { id: GEMINI_MODEL.exec, label: 'Gemini 2.5 Flash' },
    { id: GEMINI_MODEL.classify, label: 'Gemini 2.5 Flash-Lite' },
  ],
  kimi: [
    { id: KIMI_MODEL.plan, label: 'Kimi K2.6' },
    { id: KIMI_MODEL.classify, label: 'Moonshot v1 8k' },
  ],
  local: [],
};
