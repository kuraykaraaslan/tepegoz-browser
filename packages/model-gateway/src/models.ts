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
 * `output_config.effort` levels. On Opus 4.8 reasoning depth is controlled HERE — `budget_tokens`
 * is rejected with a 400 and must never be sent. Default (omitted) is server-side `high`; `xhigh`
 * is the sweet spot for coding/agentic work.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
