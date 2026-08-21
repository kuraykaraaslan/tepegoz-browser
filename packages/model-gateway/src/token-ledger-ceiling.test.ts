import { describe, it, expect, beforeEach } from 'vitest';
import { TokenLedger } from './index';

describe('TokenLedger — per-run token ceiling', () => {
  beforeEach(() => {
    TokenLedger.reset();
  });

  it('is off by default, so nothing changes for callers that never set one', () => {
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 10_000_000, outputTokens: 1 });
    expect(TokenLedger.runCeilingReached()).toBe(false);
  });

  it('treats a zero or negative ceiling as off', () => {
    TokenLedger.setRunCeiling(0);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 999, outputTokens: 1 });
    expect(TokenLedger.runCeilingReached()).toBe(false);
    TokenLedger.setRunCeiling(-5);
    expect(TokenLedger.runCeilingReached()).toBe(false);
  });

  it('trips once spend reaches the ceiling', () => {
    TokenLedger.setRunCeiling(1000);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 400, outputTokens: 100 });
    expect(TokenLedger.runCeilingReached()).toBe(false);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 400, outputTokens: 100 });
    expect(TokenLedger.runCeilingReached()).toBe(true);
  });

  /** The ceiling bounds a single task, not the account — the account's budget is `setQuota`. */
  it('is independent of the account quota', () => {
    TokenLedger.setRunCeiling(100);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 100, outputTokens: 50 });
    expect(TokenLedger.runCeilingReached()).toBe(true);
    expect(TokenLedger.budgetStatus().exceeded).toBe(false);
  });

  it('is cleared by reset, like every other run-scoped setting', () => {
    TokenLedger.setRunCeiling(10);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 50, outputTokens: 0 });
    expect(TokenLedger.runCeilingReached()).toBe(true);
    TokenLedger.reset();
    expect(TokenLedger.runCeilingReached()).toBe(false);
  });

  it('does not leak between concurrent runs', async () => {
    await TokenLedger.runScoped(() => {
      TokenLedger.setRunCeiling(100);
      TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 200, outputTokens: 0 });
      expect(TokenLedger.runCeilingReached()).toBe(true);
      return Promise.resolve();
    });
    await TokenLedger.runScoped(() => {
      // A second task starts with its own clean ceiling, not the first one's exhausted state.
      expect(TokenLedger.runCeilingReached()).toBe(false);
      return Promise.resolve();
    });
  });
});

describe('TokenLedger — cache counters', () => {
  beforeEach(() => {
    TokenLedger.reset();
  });

  it('accumulates cache reads and writes alongside plain tokens', () => {
    TokenLedger.record('anthropic', 'm', 'exec', {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 900,
      cacheWriteTokens: 50,
    });
    TokenLedger.record('anthropic', 'm', 'exec', {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 800,
    });
    const totals = TokenLedger.totals();
    expect(totals.cacheReadTokens).toBe(1700);
    expect(totals.cacheWriteTokens).toBe(50);
  });

  /**
   * Vendors report `inputTokens` as the tokens NOT served from or written to the cache, so the cache
   * counters are additive. Omitting them would make a well-cached run look nearly free to the quota
   * gate while it processed just as many tokens.
   */
  it('counts cache tokens in the quota-bearing total — they are additive, not a breakdown', () => {
    TokenLedger.record('anthropic', 'm', 'exec', {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 5000,
      cacheWriteTokens: 5000,
    });
    expect(TokenLedger.totals().totalTokens).toBe(10_110);
  });

  it('counts cache tokens toward the run ceiling too', () => {
    TokenLedger.setRunCeiling(1000);
    TokenLedger.record('anthropic', 'm', 'exec', {
      inputTokens: 10,
      outputTokens: 10,
      cacheReadTokens: 2000,
    });
    expect(TokenLedger.runCeilingReached()).toBe(true);
  });

  it('reports zero for providers that never send the counters', () => {
    TokenLedger.record('openai', 'gpt', 'exec', { inputTokens: 10, outputTokens: 2 });
    expect(TokenLedger.totals().cacheReadTokens).toBe(0);
    expect(TokenLedger.snapshotEntries()[0]?.cacheWriteTokens).toBe(0);
  });
});
