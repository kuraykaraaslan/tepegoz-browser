import { AsyncLocalStorage } from 'node:async_hooks';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonUsage } from './types';

interface LedgerEntry {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/** A flattened per-(provider,model,capability) usage row — the shape the host persists to the
 *  SQLite Token Ledger (provider+model+capability granularity) at the end of a run. */
export interface LedgerEntryView {
  provider: AIProvider;
  model: string;
  capability: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/** Live budget/quota status for the run, computed from the persisted lifetime baseline + this run's
 *  usage. Feeds the quota indicator, the 80% warning, and the pre-flight budget gate. */
export interface BudgetStatus {
  /** Total token quota (input+output). 0 = unlimited/off. */
  quota: number;
  /** Tokens counted so far = persisted-lifetime baseline + this run's totals. */
  used: number;
  /** used/quota clamped to [0, 1]; 0 when the quota is off. */
  ratio: number;
  /** True once ratio ≥ 0.8 (warning threshold), and only when a quota is set. */
  warn: boolean;
  /** True once used ≥ quota, and only when a quota is set. */
  exceeded: boolean;
}

/** The 80% warning threshold (internal-ai-rules: cost transparency — warn before the quota is hit). */
export const BUDGET_WARN_RATIO = 0.8;

function key(provider: AIProvider, model: string, capability: string): string {
  return `${provider}:${model}:${capability}`;
}

/** One run's (or the ambient) accumulator. */
interface LedgerState {
  entries: Map<string, LedgerEntry>;
  budgets: Map<string, number>;
  /** Persisted lifetime usage (input+output) before this run — seeded by the host from the TokenStore. */
  baseline: number;
  /** Total-token quota for the account (0 = unlimited/off). */
  quota: number;
}

function newState(): LedgerState {
  return { entries: new Map(), budgets: new Map(), baseline: 0, quota: 0 };
}

/**
 * Per-run accumulators, scoped the same way `ToolGateway.runWithHandlers` scopes its handlers.
 *
 * The counters used to be plain statics cleared by `reset()` at each run start, which is safe for
 * exactly one run at a time: a second run starting would zero the ledger the first was still counting
 * into, so its persisted usage — and its quota gate — would be wrong. Under an ALS scope each run
 * accumulates into its own state and nothing leaks between them.
 */
const scope = new AsyncLocalStorage<LedgerState>();

/**
 * The accumulator for callers OUTSIDE a run — the translate/typo extensions, tests, and any direct
 * `ModelGateway.complete`. Bounded by the number of provider:model:capability combinations, so it is
 * not a growth risk.
 */
const ambient = newState();

function state(): LedgerState {
  return scope.getStore() ?? ambient;
}

/**
 * Token usage accounting (internal-ai-rules: cost transparency — no AI feature without a budget).
 *
 * In-memory, PER-RUN accumulator (see {@link TokenLedger.runScoped}) so the live indicator shows this
 * task's spend. The host persists the run's entries to the SQLite Token Ledger at run end
 * (provider+model+capability granularity, sync-ready) and seeds {@link setBaseline} with the account's
 * lifetime total so the {@link budgetStatus} quota/80%-warning reflects cumulative usage, not just the
 * current run.
 */
export class TokenLedger {
  /**
   * Run `fn` with its OWN ledger state. Everything the callback awaits — including its `finally`, which
   * is where the host reads {@link snapshotEntries} to persist the run — sees that state and no other's.
   */
  static runScoped<T>(fn: () => Promise<T>): Promise<T> {
    return scope.run(newState(), fn);
  }

  /** Clear the CURRENT scope's counters (the run's own, or the ambient one outside a run). */
  static reset(): void {
    const s = state();
    s.entries.clear();
    s.budgets.clear();
    s.baseline = 0;
    s.quota = 0;
  }

  /** Seed the persisted lifetime total (input+output) so budgetStatus reflects cumulative usage. */
  static setBaseline(usedTokens: number): void {
    state().baseline = Number.isFinite(usedTokens) && usedTokens > 0 ? usedTokens : 0;
  }

  /** Set the account-wide total-token quota (0 disables the quota / 80% warning / pre-flight gate). */
  static setQuota(totalTokens: number): void {
    state().quota = Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0;
  }

  /** Set a per-capability output-token budget (e.g. classify=200, plan=2000). */
  static setBudget(capability: string, maxOutputTokens: number): void {
    state().budgets.set(capability, maxOutputTokens);
  }

  static record(provider: AIProvider, model: string, capability: string, usage: CanonUsage): void {
    const entries = state().entries;
    const k = key(provider, model, capability);
    const cur = entries.get(k) ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
    cur.inputTokens += usage.inputTokens;
    cur.outputTokens += usage.outputTokens;
    cur.calls += 1;
    entries.set(k, cur);
  }

  static totalOutputForCapability(capability: string): number {
    let total = 0;
    for (const [k, e] of state().entries) {
      if (k.endsWith(`:${capability}`)) total += e.outputTokens;
    }
    return total;
  }

  /** Aggregate usage across every provider/model/capability (feeds the live quota indicator). */
  static totals(): { inputTokens: number; outputTokens: number; totalTokens: number; calls: number } {
    let inputTokens = 0;
    let outputTokens = 0;
    let calls = 0;
    for (const e of state().entries.values()) {
      inputTokens += e.inputTokens;
      outputTokens += e.outputTokens;
      calls += e.calls;
    }
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, calls };
  }

  /** Per-(provider,model,capability) breakdown of THIS run — persisted to the SQLite Token Ledger. */
  static snapshotEntries(): LedgerEntryView[] {
    const out: LedgerEntryView[] = [];
    for (const [k, e] of state().entries) {
      // key() joins with ':' but a model id can itself contain ':' — split off the fixed first
      // (provider) and last (capability) segments and rejoin the middle as the model.
      const parts = k.split(':');
      const provider = parts[0] as AIProvider;
      const capability = parts.at(-1) ?? '';
      const model = parts.slice(1, -1).join(':');
      out.push({
        provider,
        model,
        capability,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        calls: e.calls,
      });
    }
    return out;
  }

  /** Budget/quota status = (baseline + this run's totals) against the account quota. */
  static budgetStatus(): BudgetStatus {
    const s = state();
    const used = s.baseline + TokenLedger.totals().totalTokens;
    const quota = s.quota;
    if (quota <= 0) return { quota: 0, used, ratio: 0, warn: false, exceeded: false };
    const ratio = Math.min(used / quota, 1);
    return { quota, used, ratio, warn: ratio >= BUDGET_WARN_RATIO, exceeded: used >= quota };
  }

  /** True when the account quota is already met/exceeded BEFORE a run starts (pre-flight gate). */
  static quotaExhausted(): boolean {
    const s = state();
    return s.quota > 0 && s.baseline >= s.quota;
  }

  /** True if recording `projectedOutput` more tokens would exceed the capability's budget. */
  static wouldExceedBudget(capability: string, projectedOutput: number): boolean {
    const budget = state().budgets.get(capability);
    if (budget === undefined) return false;
    return TokenLedger.totalOutputForCapability(capability) + projectedOutput > budget;
  }
}
