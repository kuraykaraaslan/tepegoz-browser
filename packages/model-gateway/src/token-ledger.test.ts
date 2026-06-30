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
});
