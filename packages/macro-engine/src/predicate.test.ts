import { describe, expect, it } from 'vitest';
import type { CompareOp, Predicate, SelectorChain } from '@tepegoz/shared-types';
import { evalPredicate } from './predicate';
import type { MacroHost } from './host';
import { VariableStore } from './variables';

/**
 * `evalPredicate` — the deterministic, model-free condition evaluator behind `if` / `repeat while` /
 * `assert`. Recursive over `and`/`or`/`not`; `varCompare` runs two safe expressions through the
 * variable store and applies one of the eight compare ops (`matches` swallows a bad regex → false).
 */

const sel: SelectorChain = [{ kind: 'css', value: '#x' }];

function host(over: Partial<MacroHost> = {}): MacroHost {
  const base = {
    elementExists: () => Promise.resolve(true),
    elementVisible: () => Promise.resolve(false),
    pageContainsText: (t: string) => Promise.resolve(t === 'here'),
  } as unknown as MacroHost;
  return Object.assign(base, over);
}

const vars = (initial?: Record<string, string | number>) => new VariableStore(initial);

describe('the host-backed predicates', () => {
  it('elementExists / elementVisible delegate to the host', async () => {
    expect(await evalPredicate({ kind: 'elementExists', target: sel }, host(), vars())).toBe(true);
    expect(await evalPredicate({ kind: 'elementVisible', target: sel }, host(), vars())).toBe(false);
  });

  it('textPresent interpolates the query; textAbsent negates it', async () => {
    const h = host();
    const v = vars({ q: 'here' });
    expect(await evalPredicate({ kind: 'textPresent', text: '{{q}}' }, h, v)).toBe(true);
    expect(await evalPredicate({ kind: 'textAbsent', text: '{{q}}' }, h, v)).toBe(false);
    expect(await evalPredicate({ kind: 'textPresent', text: 'gone' }, h, v)).toBe(false);
  });
});

describe('varCompare — every op', () => {
  const cmp = (left: string, op: CompareOp, right: string) =>
    evalPredicate({ kind: 'varCompare', left, op, right }, host(), vars({ n: 5, s: 'hello' }));

  it('eq / ne compare as strings', async () => {
    expect(await cmp('n', 'eq', '5')).toBe(true);
    expect(await cmp('n', 'ne', '5')).toBe(false);
    expect(await cmp('s', 'ne', '"world"')).toBe(true);
  });

  it('lt / lte / gt / gte compare as numbers', async () => {
    expect(await cmp('n', 'lt', '10')).toBe(true);
    expect(await cmp('n', 'lte', '5')).toBe(true);
    expect(await cmp('n', 'gt', '1')).toBe(true);
    expect(await cmp('n', 'gte', '6')).toBe(false);
  });

  it('contains does a substring test; matches runs a regex (bad pattern → false)', async () => {
    expect(await cmp('s', 'contains', '"ell"')).toBe(true);
    expect(await cmp('s', 'matches', '"^h.*o$"')).toBe(true);
    expect(await cmp('s', 'matches', '"("')).toBe(false); // unbalanced group → caught
  });
});

describe('the recursive combinators', () => {
  const T: Predicate = { kind: 'varCompare', left: '1', op: 'eq', right: '1' };
  const F: Predicate = { kind: 'varCompare', left: '1', op: 'eq', right: '2' };

  it('and is true only when every child is', async () => {
    expect(await evalPredicate({ kind: 'and', all: [T, T] }, host(), vars())).toBe(true);
    expect(await evalPredicate({ kind: 'and', all: [T, F] }, host(), vars())).toBe(false);
  });

  it('or is true when any child is', async () => {
    expect(await evalPredicate({ kind: 'or', any: [F, T] }, host(), vars())).toBe(true);
    expect(await evalPredicate({ kind: 'or', any: [F, F] }, host(), vars())).toBe(false);
  });

  it('not inverts its child', async () => {
    expect(await evalPredicate({ kind: 'not', of: F }, host(), vars())).toBe(true);
  });
});
