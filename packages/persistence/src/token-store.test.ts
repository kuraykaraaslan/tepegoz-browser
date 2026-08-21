import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from './index';
import { TokenStore, type TokenUsageEntry } from './token-store';

function entry(over: Partial<TokenUsageEntry> = {}): TokenUsageEntry {
  return {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    capability: 'plan',
    inputTokens: 100,
    outputTokens: 200,
    calls: 1,
    ...over,
  };
}

describe('TokenStore', () => {
  it('persists a run and reports lifetime totals across restarts', () => {
    const db = openDatabase(':memory:');
    migrate(db);

    TokenStore.recordRun(db, {
      correlationId: 'run-1',
      ts: 1000,
      entries: [
        entry(),
        entry({ capability: 'exec', model: 'claude-sonnet-4-6', outputTokens: 50 }),
      ],
    });
    TokenStore.recordRun(db, {
      correlationId: 'run-2',
      ts: 2000,
      entries: [entry({ inputTokens: 10, outputTokens: 5 })],
    });

    const totals = TokenStore.lifetimeTotals(db);
    expect(totals.inputTokens).toBe(210); // 100 + 100 + 10
    expect(totals.outputTokens).toBe(255); // 200 + 50 + 5
    expect(totals.totalTokens).toBe(465);
    expect(totals.calls).toBe(3);
  });

  it('ignores empty/zero-usage runs', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    TokenStore.recordRun(db, { correlationId: 'run-x', ts: 1, entries: [] });
    TokenStore.recordRun(db, {
      correlationId: 'run-y',
      ts: 1,
      entries: [entry({ inputTokens: 0, outputTokens: 0, calls: 0 })],
    });
    expect(TokenStore.lifetimeTotals(db).totalTokens).toBe(0);
  });

  it('excludes a refunded run from the quota total (auto-refund)', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    TokenStore.recordRun(db, { correlationId: 'run-ok', ts: 1, entries: [entry()] }); // 300
    TokenStore.recordRun(db, {
      correlationId: 'run-bad',
      ts: 2,
      entries: [entry({ outputTokens: 900 })],
    }); // 1000

    expect(TokenStore.lifetimeTotals(db).totalTokens).toBe(1300);
    const refunded = TokenStore.refundRun(db, 'run-bad', 3);
    expect(refunded).toBe(1);
    expect(TokenStore.lifetimeTotals(db).totalTokens).toBe(300); // run-bad no longer counts
  });

  it('refunding a run twice is idempotent (only unrefunded rows change)', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    TokenStore.recordRun(db, { correlationId: 'run-1', ts: 1, entries: [entry()] });
    expect(TokenStore.refundRun(db, 'run-1', 2)).toBe(1);
    expect(TokenStore.refundRun(db, 'run-1', 3)).toBe(0);
  });

  it('aggregates usage by provider/model/capability, highest total first', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    TokenStore.recordRun(db, {
      correlationId: 'r1',
      ts: 1,
      entries: [
        entry({
          capability: 'classify',
          model: 'claude-haiku-4-5',
          inputTokens: 5,
          outputTokens: 5,
        }),
        entry({ inputTokens: 500, outputTokens: 500 }),
      ],
    });
    const byModel = TokenStore.usageByModel(db);
    expect(byModel[0]).toMatchObject({ capability: 'plan', totalTokens: 1000 });
    expect(byModel[1]).toMatchObject({ capability: 'classify', totalTokens: 10 });
  });

  it('clear tombstones all rows so they drop out of totals', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    TokenStore.recordRun(db, { correlationId: 'r', ts: 1, entries: [entry()] });
    TokenStore.clear(db, 2);
    expect(TokenStore.lifetimeTotals(db).totalTokens).toBe(0);
    expect(TokenStore.usageByModel(db)).toEqual([]);
  });
});
