import { cn } from '@tepegoz/ui';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import type { AgentStrings } from './i18n';

/**
 * The context-fullness gauge (S8 PR8 A2) — a thin bar next to the token counter showing how full the
 * MODEL'S context window is for the current run, which is a different question from the token counter
 * (that one measures cost against your quota). Context fullness is the real breaking point of a long
 * run: as the window fills, the agent summarises earlier steps to keep going, and this is the warning
 * that answers "why did it suddenly compact" before it happens.
 *
 * **What is real and what is an estimate.** `contextTokens` is real — the largest single prompt the
 * run has actually sent to the model (`TokenLedger.peakContextTokens`). The window MAX is a
 * per-model lookup below; model context windows are not yet reported to the panel, so the denominator
 * is a conservative constant. The tooltip says so. Precise per-model wiring is a tracked follow-up.
 */

/** Amber past this fraction of the window, red past {@link RED_AT}. */
const AMBER_AT = 0.7;
const RED_AT = 0.85;

/**
 * Context-window size per known model id (tokens). Sourced from the `claude-api` reference (Opus 5 /
 * Sonnet 5 = 1M, Haiku 4.5 = 200K) and each provider's published limits; the non-Anthropic numbers are
 * best-effort and deliberately on the conservative side. An unknown id falls back to the provider
 * floor, then to {@link DEFAULT_WINDOW}.
 */
const CONTEXT_WINDOW_TOKENS: Record<string, number> = {
  'claude-opus-5': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-haiku-4-5': 200_000,
  'gpt-5': 400_000,
  'gpt-5-mini': 400_000,
  'gemini-3-pro': 1_000_000,
  'gemini-3-flash': 1_000_000,
  'gemini-3-flash-lite': 1_000_000,
  'kimi-k2.6': 256_000,
  'moonshot-v1-8k': 8_000,
  'nova-2-lite-v1': 300_000,
  'nova-micro-v1': 128_000,
  'deepseek-reasoner': 128_000,
  'deepseek-chat': 128_000,
  'grok-4': 256_000,
  'grok-3-mini': 131_072,
  'llama-3.3-70b-versatile': 128_000,
  'llama-3.1-8b-instant': 128_000,
};

/** Conservative per-provider floor used when the run auto-routes (no pinned model) or the id is new. */
const PROVIDER_FALLBACK_WINDOW: Partial<Record<AIProvider, number>> = {
  anthropic: 200_000,
  openai: 256_000,
  gemini: 1_000_000,
  kimi: 128_000,
  nova: 128_000,
  deepseek: 128_000,
  xai: 128_000,
  groq: 128_000,
  local: 32_000,
};

const DEFAULT_WINDOW = 128_000;

/** Best-effort context-window size (tokens) for the run's provider + (optional pinned) model. */
export function contextWindowFor(
  provider: AIProvider | undefined,
  model: string | undefined,
): number {
  const byModel = model !== undefined && model !== '' ? CONTEXT_WINDOW_TOKENS[model] : undefined;
  if (byModel !== undefined) return byModel;
  const byProvider = provider !== undefined ? PROVIDER_FALLBACK_WINDOW[provider] : undefined;
  return byProvider ?? DEFAULT_WINDOW;
}

/** Compact token count: `148k`, `1.2M`. */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${String(Math.round(n / 1_000))}k`;
  return String(Math.round(n));
}

interface ContextGaugeProps {
  /** {@link TokenUsageSnapshot.contextTokens} — peak single-call prompt size for the current run. */
  contextTokens: number;
  provider: AIProvider | undefined;
  /** Pinned model id, or `''`/undefined when the run auto-routes. */
  model: string | undefined;
  a: AgentStrings;
}

export function ContextGauge({ contextTokens, provider, model, a }: ContextGaugeProps) {
  // No data yet (run not started, or a build that does not report it) → render nothing. A gauge
  // pinned at 0% is noise, and worse, it implies the window is empty when we simply do not know.
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return null;

  const max = contextWindowFor(provider, model);
  const ratio = Math.min(contextTokens / max, 1);
  const pct = Math.round(ratio * 100);
  const band: 'normal' | 'amber' | 'red' =
    ratio >= RED_AT ? 'red' : ratio >= AMBER_AT ? 'amber' : 'normal';
  const fillClass = { normal: 'bg-text-disabled', amber: 'bg-amber-500', red: 'bg-red-500' }[band];
  const textClass = {
    normal: 'text-text-secondary',
    amber: 'text-amber-500',
    red: 'text-red-500',
  }[band];

  const fill = (s: string): string =>
    s
      .replace('{pct}', String(pct))
      .replace('{used}', fmtTokens(contextTokens))
      .replace('{max}', fmtTokens(max));

  return (
    <span
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={fill(a.context.aria)}
      title={fill(a.context.tooltip)}
    >
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-surface-overlay">
        <span
          className={cn('block h-full rounded-full', fillClass)}
          style={{ width: `${String(pct)}%` }}
        />
      </span>
      <span className={cn('text-xs tabular-nums', textClass)}>
        {a.context.label} {pct}%
      </span>
    </span>
  );
}
