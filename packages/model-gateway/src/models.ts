import type { AIProvider } from '@tepegoz/shared-types';

/**
 * Canonical Anthropic model IDs and effort levels — verified against the `claude-api` reference
 * (SDK @anthropic-ai/sdk 0.107.0). Centralized so the orchestrator and UI reference a single
 * source instead of hardcoding strings.
 *
 * Role assignment per the architecture (docs/ai-transparency.md §1 — "Tier roles"):
 *   - Opus 5    → planning (and vision-heavy execution, a later slice)
 *   - Sonnet 5  → standard execution
 *   - Haiku 4.5 → cheap classification
 * Same request surface as the 4.8/4.6 line this replaced (adaptive thinking, no `budget_tokens`, no
 * prefill), so the adapter is unchanged. Compaction is deliberately NOT assigned to Haiku (server-side
 * compaction is unsupported there).
 */
export const ANTHROPIC_MODEL = {
  plan: 'claude-opus-5',
  exec: 'claude-sonnet-5',
  classify: 'claude-haiku-4-5',
} as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODEL)[keyof typeof ANTHROPIC_MODEL];

/**
 * OpenAI model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router can pick a
 * provider's map by the SAME `plan | exec | classify` key. Mirrors the Anthropic tiering (capable for
 * plan/exec, cheap for classify): `gpt-5` drives planning AND the reactive exec loop (it must emit the
 * exact decision shape reliably — `gpt-5-mini` does not), and `gpt-5-mini` handles cheap classify. The
 * OpenAI adapter sends no effort field. These ids are TUNABLE DEFAULTS, not verified against a spec
 * (docs/ai-transparency.md §1) — edit here to retune (e.g. a newer `gpt-5.x`, or drop exec to mini).
 */
export const OPENAI_MODEL = {
  plan: 'gpt-5',
  exec: 'gpt-5',
  classify: 'gpt-5-mini',
} as const;

export type OpenAIModelId = (typeof OPENAI_MODEL)[keyof typeof OPENAI_MODEL];

/**
 * Google Gemini model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router picks a
 * provider's map by the SAME `plan | exec | classify` key. Mirrors the capable/cheap tiering: `3-pro`
 * for planning, `3-flash` for the reactive exec loop, `3-flash-lite` for cheap classify. Plain
 * generateContent models (no Anthropic-style effort field). TUNABLE DEFAULTS, not verified against a
 * spec (docs/ai-transparency.md §1) — if Google only publishes dated/preview aliases in a region, swap
 * the exact id here; the routing LOGIC does not change.
 */
export const GEMINI_MODEL = {
  plan: 'gemini-3-pro',
  exec: 'gemini-3-flash',
  classify: 'gemini-3-flash-lite',
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
 * Amazon Nova model IDs per tier — same three roles as {@link ANTHROPIC_MODEL} so the router picks a
 * provider's map by the SAME `plan | exec | classify` key. These target Amazon's OpenAI-compatible
 * *consumer* API (`api.nova.amazon.com/v1`, a plain Bearer key — NOT AWS Bedrock, no region, no SigV4).
 * `nova-2-lite-v1` (Nova 2 Lite — 64k context, tools + vision + reasoning) drives planning AND the
 * reactive exec loop, and the cheaper text-only `nova-micro-v1` handles classify. Plain chat models,
 * so no Anthropic-style effort field is sent. Edit here to retune (e.g. point plan at `nova-pro-v1`) —
 * the routing LOGIC is provider-agnostic and does not change.
 */
export const NOVA_MODEL = {
  plan: 'nova-2-lite-v1',
  exec: 'nova-2-lite-v1',
  classify: 'nova-micro-v1',
} as const;

export type NovaModelId = (typeof NOVA_MODEL)[keyof typeof NOVA_MODEL];

/**
 * DeepSeek model IDs per tier — same three roles as {@link ANTHROPIC_MODEL}. OpenAI-compatible API
 * (`api.deepseek.com/v1`, plain Bearer key, `max_tokens`). `deepseek-reasoner` (R1-line, thinking) for
 * planning; `deepseek-chat` (V3-line, fast) for the reactive exec loop AND cheap classify — it emits the
 * strict decision shape reliably where the reasoner's long think stream does not. Edit here to retune.
 */
export const DEEPSEEK_MODEL = {
  plan: 'deepseek-reasoner',
  exec: 'deepseek-chat',
  classify: 'deepseek-chat',
} as const;

export type DeepSeekModelId = (typeof DEEPSEEK_MODEL)[keyof typeof DEEPSEEK_MODEL];

/**
 * xAI (Grok) model IDs per tier — same three roles as {@link ANTHROPIC_MODEL}. OpenAI-compatible API
 * (`api.x.ai/v1`, plain Bearer key, `max_tokens`); regional endpoints (`<region>.api.x.ai`) are selected
 * per key (see `PROVIDER_REGIONS`). `grok-4` drives planning AND exec; the cheaper `grok-3-mini` handles
 * classify. Plain chat models — no effort field. Edit here to retune.
 */
export const XAI_MODEL = {
  plan: 'grok-4',
  exec: 'grok-4',
  classify: 'grok-3-mini',
} as const;

export type XaiModelId = (typeof XAI_MODEL)[keyof typeof XAI_MODEL];

/**
 * Groq model IDs per tier — same three roles as {@link ANTHROPIC_MODEL}. OpenAI-compatible API
 * (`api.groq.com/openai/v1`, plain Bearer key, `max_tokens`) hosting open-weight models on Groq's LPU
 * inference. `llama-3.3-70b-versatile` for planning AND exec; `llama-3.1-8b-instant` for cheap classify.
 * Edit here to retune (e.g. swap in `openai/gpt-oss-120b` or a hosted Kimi/Qwen id).
 */
export const GROQ_MODEL = {
  plan: 'llama-3.3-70b-versatile',
  exec: 'llama-3.3-70b-versatile',
  classify: 'llama-3.1-8b-instant',
} as const;

export type GroqModelId = (typeof GROQ_MODEL)[keyof typeof GROQ_MODEL];

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
    { id: ANTHROPIC_MODEL.plan, label: 'Opus 5' },
    { id: ANTHROPIC_MODEL.exec, label: 'Sonnet 5' },
    { id: ANTHROPIC_MODEL.classify, label: 'Haiku 4.5' },
  ],
  openai: [
    { id: OPENAI_MODEL.plan, label: 'GPT-5' },
    { id: OPENAI_MODEL.classify, label: 'GPT-5 mini' },
  ],
  gemini: [
    { id: GEMINI_MODEL.plan, label: 'Gemini 3 Pro' },
    { id: GEMINI_MODEL.exec, label: 'Gemini 3 Flash' },
    { id: GEMINI_MODEL.classify, label: 'Gemini 3 Flash-Lite' },
  ],
  kimi: [
    { id: KIMI_MODEL.plan, label: 'Kimi K2.6' },
    { id: KIMI_MODEL.classify, label: 'Moonshot v1 8k' },
  ],
  nova: [
    { id: NOVA_MODEL.plan, label: 'Nova 2 Lite' },
    { id: NOVA_MODEL.classify, label: 'Nova Micro' },
  ],
  deepseek: [
    { id: DEEPSEEK_MODEL.plan, label: 'DeepSeek R1 (reasoner)' },
    { id: DEEPSEEK_MODEL.exec, label: 'DeepSeek V3 (chat)' },
  ],
  xai: [
    { id: XAI_MODEL.plan, label: 'Grok 4' },
    { id: XAI_MODEL.classify, label: 'Grok 3 Mini' },
  ],
  groq: [
    { id: GROQ_MODEL.plan, label: 'Llama 3.3 70B' },
    { id: GROQ_MODEL.classify, label: 'Llama 3.1 8B Instant' },
  ],
  local: [],
};

/** One selectable service region for a provider whose API is offered on more than one endpoint. */
export interface ProviderRegionOption {
  /** Stable id persisted per key (`ProviderKeyMeta.region`). `''`/absent ⇒ the provider's default. */
  id: string;
  /** Friendly label for the picker, e.g. "EU West (eu-west-1)". */
  label: string;
  /** The API root this region resolves to — passed to the adapter as its `baseURL`. */
  baseURL: string;
}

/**
 * Providers whose API is served from more than one endpoint (data-residency / China split). A key for
 * one of these carries a `region` id; {@link resolveProviderBaseURL} maps it to the `baseURL` the
 * adapter is built with. The FIRST entry is the default (what a key with no region uses). A provider
 * absent here has exactly one endpoint — no picker is shown and the adapter keeps its built-in default.
 *
 * Kept beside {@link PROVIDER_MODEL_CATALOG}: same shape of "per-provider selectable metadata the
 * Settings UI renders and the runtime consumes", one source so the picker and the adapter can't drift.
 */
export const PROVIDER_REGIONS: Partial<Record<AIProvider, readonly ProviderRegionOption[]>> = {
  kimi: [
    { id: 'global', label: 'Global (moonshot.ai)', baseURL: 'https://api.moonshot.ai/v1' },
    { id: 'cn', label: 'China (moonshot.cn)', baseURL: 'https://api.moonshot.cn/v1' },
  ],
  xai: [
    { id: 'global', label: 'Global (auto-routed)', baseURL: 'https://api.x.ai/v1' },
    { id: 'us-east-1', label: 'US East (us-east-1)', baseURL: 'https://us-east-1.api.x.ai/v1' },
    { id: 'us-west-2', label: 'US West (us-west-2)', baseURL: 'https://us-west-2.api.x.ai/v1' },
    { id: 'eu-west-1', label: 'EU West (eu-west-1)', baseURL: 'https://eu-west-1.api.x.ai/v1' },
  ],
};

/** The selectable regions for `provider` (empty ⇒ single endpoint, no picker). */
export function providerRegions(provider: AIProvider): readonly ProviderRegionOption[] {
  return PROVIDER_REGIONS[provider] ?? [];
}

/**
 * The `baseURL` a key's stored `region` resolves to, or `undefined` when the provider has one endpoint,
 * no region was chosen, or the id is stale — in every one of those cases the adapter falls back to its
 * own built-in default, which is the correct, safe behaviour.
 */
export function resolveProviderBaseURL(
  provider: AIProvider,
  region: string | undefined,
): string | undefined {
  const regions = PROVIDER_REGIONS[provider];
  if (regions === undefined || region === undefined || region === '') return undefined;
  return regions.find((r) => r.id === region)?.baseURL;
}
