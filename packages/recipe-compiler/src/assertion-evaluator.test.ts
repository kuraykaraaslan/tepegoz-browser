import { describe, expect, it } from 'vitest';
import type { RunSnapshot } from './assertion-evaluator';
import { evaluateAssertion } from './assertion-evaluator';

const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  url: 'https://shop.test/orders/42/confirm',
  pageText: 'Order confirmed. Total: 129.50',
  journaledEffects: ['TaskSucceeded'],
  extractedNumerics: { s1: 129.5 },
  ...over,
});

describe('url_pattern', () => {
  it('passes an exact match', () => {
    const v = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/orders/42/confirm' },
      snapshot(),
    );
    expect(v.passed).toBe(true);
  });

  it('matches the * wildcard against a varying segment', () => {
    const v = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/orders/*/confirm' },
      snapshot(),
    );
    expect(v.passed).toBe(true);
  });

  it('fails a URL that landed on the wrong page — the abandonment case', () => {
    const v = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/orders/*/confirm' },
      snapshot({ url: 'https://shop.test/cart' }),
    );
    expect(v.passed).toBe(false);
  });

  it('does not let the wildcard escape its own segment', () => {
    // "*" should not become ".*" across a "/" in a way that matches something with EXTRA path segments
    // it should not — this pattern must reject a deeper path than the recorded one.
    const v = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/orders/*/confirm' },
      snapshot({ url: 'https://shop.test/orders/42/confirm/receipt' }),
    );
    expect(v.passed).toBe(false);
  });

  it('treats special regex characters in the pattern as LITERAL, not as regex', () => {
    const v = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/search?q=a+b' },
      snapshot({ url: 'https://shop.test/search?q=a+b' }),
    );
    expect(v.passed).toBe(true);
    const shouldNotMatch = evaluateAssertion(
      { kind: 'url_pattern', pattern: 'https://shop.test/search?q=a+b' },
      snapshot({ url: 'https://shop.test/searchXq=aXb' }),
    );
    expect(shouldNotMatch.passed).toBe(false);
  });
});

describe('text_present', () => {
  it('passes when the text appears anywhere on the page', () => {
    expect(
      evaluateAssertion({ kind: 'text_present', text: 'Order confirmed' }, snapshot()).passed,
    ).toBe(true);
  });

  it('fails when it does not', () => {
    expect(
      evaluateAssertion({ kind: 'text_present', text: 'Payment declined' }, snapshot()).passed,
    ).toBe(false);
  });
});

describe('effect_journaled', () => {
  it('passes when the exact event type was journaled this run', () => {
    const v = evaluateAssertion(
      { kind: 'effect_journaled', eventType: 'TaskSucceeded' },
      snapshot(),
    );
    expect(v.passed).toBe(true);
  });

  it('fails on an event that was never journaled — catches a run that never actually committed', () => {
    const v = evaluateAssertion(
      { kind: 'effect_journaled', eventType: 'UploadCompleted' },
      snapshot(),
    );
    expect(v.passed).toBe(false);
  });
});

describe('numeric_extracted', () => {
  const assertion = (comparator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte', value: number) => ({
    kind: 'numeric_extracted' as const,
    selector: {},
    comparator,
    value,
  });

  it('passes eq/gt/lt/gte/lte correctly against an extracted value', () => {
    expect(evaluateAssertion(assertion('eq', 129.5), snapshot()).passed).toBe(true);
    expect(evaluateAssertion(assertion('gt', 100), snapshot()).passed).toBe(true);
    expect(evaluateAssertion(assertion('lt', 100), snapshot()).passed).toBe(false);
    expect(evaluateAssertion(assertion('gte', 129.5), snapshot()).passed).toBe(true);
    expect(evaluateAssertion(assertion('lte', 129.5), snapshot()).passed).toBe(true);
  });

  it('fails, rather than vacuously passing, when NOTHING was extracted', () => {
    // An empty extraction is a run that never reached the extracting step — that must read as a
    // failure, not as "no constraint to violate".
    const v = evaluateAssertion(assertion('gt', 0), snapshot({ extractedNumerics: {} }));
    expect(v.passed).toBe(false);
  });
});

describe('exhaustiveness', () => {
  it('refuses an unrecognised assertion kind rather than silently passing a hard gate', () => {
    const bogus = { kind: 'made_up_kind' } as unknown as Parameters<typeof evaluateAssertion>[0];
    const v = evaluateAssertion(bogus, snapshot());
    expect(v.passed).toBe(false);
  });
});
