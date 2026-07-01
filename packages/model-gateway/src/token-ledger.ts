import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonUsage } from './types';

interface LedgerEntry {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

function key(provider: AIProvider, model: string, capability: string): string {
  return `${provider}:${model}:${capability}`;
}

/**
 * Token usage accounting (internal-ai-rules: cost transparency — no AI feature without a budget).
 * In-memory for this framework slice; persisted to SQLite (and surfaced as the live quota indicator)
 * in a later slice.
 */
export class TokenLedger {
  private static readonly entries = new Map<string, LedgerEntry>();
  private static readonly budgets = new Map<string, number>();

  static reset(): void {
    TokenLedger.entries.clear();
    TokenLedger.budgets.clear();
  }

  /** Set a per-capability output-token budget (e.g. classify=200, plan=2000). */
  static setBudget(capability: string, maxOutputTokens: number): void {
    TokenLedger.budgets.set(capability, maxOutputTokens);
  }

  static record(provider: AIProvider, model: string, capability: string, usage: CanonUsage): void {
    const k = key(provider, model, capability);
    const cur = TokenLedger.entries.get(k) ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
    cur.inputTokens += usage.inputTokens;
    cur.outputTokens += usage.outputTokens;
    cur.calls += 1;
    TokenLedger.entries.set(k, cur);
  }

  static totalOutputForCapability(capability: string): number {
    let total = 0;
    for (const [k, e] of TokenLedger.entries) {
      if (k.endsWith(`:${capability}`)) total += e.outputTokens;
    }
    return total;
  }

  /** Aggregate usage across every provider/model/capability (feeds the live quota indicator). */
  static totals(): { inputTokens: number; outputTokens: number; totalTokens: number; calls: number } {
    let inputTokens = 0;
    let outputTokens = 0;
    let calls = 0;
    for (const e of TokenLedger.entries.values()) {
      inputTokens += e.inputTokens;
      outputTokens += e.outputTokens;
      calls += e.calls;
    }
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, calls };
  }

  /** True if recording `projectedOutput` more tokens would exceed the capability's budget. */
  static wouldExceedBudget(capability: string, projectedOutput: number): boolean {
    const budget = TokenLedger.budgets.get(capability);
    if (budget === undefined) return false;
    return TokenLedger.totalOutputForCapability(capability) + projectedOutput > budget;
  }
}
