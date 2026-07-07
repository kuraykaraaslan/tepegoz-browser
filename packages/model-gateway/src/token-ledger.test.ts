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
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', { inputTokens: 10, outputTokens: 40 });
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', { inputTokens: 5, outputTokens: 20 });
    TokenLedger.record('openai', 'gpt-4o', 'exec', { inputTokens: 1, outputTokens: 2 });
    const rows = TokenLedger.snapshotEntries();
    expect(rows).toContainEqual({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      capability: 'plan',
      inputTokens: 15,
      outputTokens: 60,
      calls: 2,
    });
    expect(rows).toContainEqual({
      provider: 'openai',
      model: 'gpt-4o',
      capability: 'exec',
      inputTokens: 1,
      outputTokens: 2,
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
});
