import { describe, it, expect, beforeEach } from 'vitest';
import { TokenLedger } from './index';

describe('TokenLedger', () => {
  beforeEach(() => {
    TokenLedger.reset();
  });

  it('accumulates output tokens per capability', () => {
    TokenLedger.record('anthropic', 'm1', 'plan', { inputTokens: 10, outputTokens: 40 });
    TokenLedger.record('anthropic', 'm1', 'plan', { inputTokens: 5, outputTokens: 20 });
    expect(TokenLedger.totalOutputForCapability('plan')).toBe(60);
  });

  it('enforces a per-capability budget', () => {
    TokenLedger.setBudget('classify', 100);
    TokenLedger.record('anthropic', 'haiku', 'classify', { inputTokens: 10, outputTokens: 60 });
    expect(TokenLedger.wouldExceedBudget('classify', 30)).toBe(false);
    expect(TokenLedger.wouldExceedBudget('classify', 50)).toBe(true);
  });

  it('reports no budget breach when none is set', () => {
    TokenLedger.record('openai', 'gpt', 'summarize', { inputTokens: 1, outputTokens: 9999 });
    expect(TokenLedger.wouldExceedBudget('summarize', 1)).toBe(false);
  });

  it('snapshots per-(provider,model,capability) rows for persistence', () => {
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', {
      inputTokens: 10,
      outputTokens: 40,
    });
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', {
      inputTokens: 5,
      outputTokens: 20,
    });
    TokenLedger.record('openai', 'gpt-4o', 'exec', { inputTokens: 1, outputTokens: 2 });
    const rows = TokenLedger.snapshotEntries();
    expect(rows).toContainEqual({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      capability: 'plan',
      inputTokens: 15,
      outputTokens: 60,
      // A provider that reports no cache counters snapshots as zero, never as absent — the persisted
      // row shape has to be the same for every provider.
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      calls: 2,
    });
    expect(rows).toContainEqual({
      provider: 'openai',
      model: 'gpt-4o',
      capability: 'exec',
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      calls: 1,
    });
  });

  it('reports a quota that is off (0) as never warning or exceeded', () => {
    TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 100, outputTokens: 900 });
    const status = TokenLedger.budgetStatus();
    expect(status).toMatchObject({ quota: 0, used: 1000, ratio: 0, warn: false, exceeded: false });
  });

  it('computes budget status from the persisted baseline plus this run', () => {
    TokenLedger.setQuota(1000);
    TokenLedger.setBaseline(700);
    TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 50, outputTokens: 60 }); // +110 → 810
    const status = TokenLedger.budgetStatus();
    expect(status.used).toBe(810);
    expect(status.warn).toBe(true); // 810/1000 ≥ 0.8
    expect(status.exceeded).toBe(false);
  });

  it('flags exceeded once used reaches the quota', () => {
    TokenLedger.setQuota(100);
    TokenLedger.setBaseline(60);
    TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 20, outputTokens: 40 }); // +60 → 120
    const status = TokenLedger.budgetStatus();
    expect(status.ratio).toBe(1); // clamped
    expect(status.exceeded).toBe(true);
  });

  it('detects an exhausted quota before a run from the baseline alone', () => {
    TokenLedger.setQuota(500);
    TokenLedger.setBaseline(500);
    expect(TokenLedger.quotaExhausted()).toBe(true);
    TokenLedger.setBaseline(499);
    expect(TokenLedger.quotaExhausted()).toBe(false);
  });

  it('reset clears the baseline and quota', () => {
    TokenLedger.setQuota(100);
    TokenLedger.setBaseline(90);
    TokenLedger.reset();
    expect(TokenLedger.budgetStatus()).toMatchObject({ quota: 0, used: 0 });
    expect(TokenLedger.quotaExhausted()).toBe(false);
  });

  describe('runScoped — concurrent runs do not share counters', () => {
    it('keeps two overlapping runs’ usage entirely separate', async () => {
      // Interleaved on purpose: each `await` hands control to the other run, which is exactly the
      // interleaving that made the old static counters wrong.
      const runA = TokenLedger.runScoped(async () => {
        TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 10, outputTokens: 10 });
        await Promise.resolve();
        TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 5, outputTokens: 5 });
        return TokenLedger.totals().totalTokens;
      });
      const runB = TokenLedger.runScoped(async () => {
        TokenLedger.record('openai', 'g', 'exec', { inputTokens: 100, outputTokens: 100 });
        await Promise.resolve();
        return TokenLedger.totals().totalTokens;
      });

      expect(await runA).toBe(30);
      expect(await runB).toBe(200);
    });

    it('scopes the quota/baseline too, so one run cannot gate another', async () => {
      await TokenLedger.runScoped(async () => {
        TokenLedger.setQuota(1000);
        TokenLedger.setBaseline(999);
        expect(TokenLedger.quotaExhausted()).toBe(false);
        await TokenLedger.runScoped(() => {
          // A nested (independent) run starts clean — it does not inherit the outer quota.
          expect(TokenLedger.budgetStatus()).toMatchObject({ quota: 0, used: 0 });
          return Promise.resolve();
        });
        // …and the outer run's own state survived the inner one untouched.
        expect(TokenLedger.budgetStatus()).toMatchObject({ quota: 1000, used: 999 });
      });
    });

    it("a run's reset() cannot clear the ambient (out-of-run) ledger", async () => {
      TokenLedger.record('anthropic', 'm', 'classify', { inputTokens: 7, outputTokens: 7 });
      await TokenLedger.runScoped(() => {
        TokenLedger.record('anthropic', 'm', 'plan', { inputTokens: 1, outputTokens: 1 });
        TokenLedger.reset();
        return Promise.resolve();
      });
      // The extension/ambient path (translate, typo, direct ModelGateway calls) is untouched.
      expect(TokenLedger.totals().totalTokens).toBe(14);
    });
  });
});
