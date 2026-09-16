import { describe, expect, it } from 'vitest';
import { contextWindowFor, MODEL_CONTEXT_WINDOW_TOKENS } from './context-window';

describe('contextWindowFor', () => {
  it('returns the verified ceiling for a listed model', () => {
    expect(contextWindowFor('claude-sonnet-5')).toBe(1_000_000);
    expect(contextWindowFor('claude-haiku-4-5')).toBe(200_000);
    expect(contextWindowFor('moonshot-v1-8k')).toBe(8_000);
  });

  it('Nova 2 Lite is 1M context, not the max-OUTPUT figure a stale comment once conflated it with', () => {
    // Regression lock: this table's first cut trusted models.ts's own doc comment ("64k context") and
    // shipped a ceiling that would have wrongly rejected any real request over ~64k tokens. AWS's own
    // Bedrock model card says 1M context / 64K max output — two different numbers, not one.
    expect(contextWindowFor('nova-2-lite-v1')).toBe(1_000_000);
  });

  it('returns null for an unlisted model — a skip, never a guessed number', () => {
    expect(contextWindowFor('gpt-5')).toBeNull();
    expect(contextWindowFor('some-model-nobody-verified')).toBeNull();
  });

  it('every table entry is a positive integer, so a typo cannot silently disable the guard', () => {
    for (const [model, ceiling] of Object.entries(MODEL_CONTEXT_WINDOW_TOKENS)) {
      expect(Number.isInteger(ceiling), model).toBe(true);
      expect(ceiling, model).toBeGreaterThan(0);
    }
  });
});
