import { describe, expect, it } from 'vitest';
import {
  MIN_CARRY_OVER_RATE,
  assignStableRefs,
  createRefRegistry,
  disambiguate,
  registryTable,
} from './stable-refs.js';
import { nodeHash, parseDomTree, type DomTreeNode } from './dom-tree.js';

/** A node with the given label; `path` varies so re-render churn is visible in the test data. */
function node(name: string, path: number[][]): DomTreeNode {
  return { tag: 'button', path, role: 'button', name };
}

describe('identity-stable refs', () => {
  it('keeps a ref across a re-render that changes every structural path', () => {
    // The fixture case: same three controls, rebuilt at a deeper nesting depth in reverse order.
    const before = [node('Open crate A', [[0]]), node('Open crate B', [[1]]), node('Open crate C', [[2]])];
    const after = [node('Open crate C', [[0, 0, 2]]), node('Open crate B', [[0, 0, 1]]), node('Open crate A', [[0, 0, 0]])];
    const registry = createRefRegistry('http://fixture/');

    const first = assignStableRefs(disambiguate(before.map(nodeHash)), registry);
    const second = assignStableRefs(disambiguate(after.map(nodeHash)), registry);

    // Positionally, "Open crate C" moved from last to first — its ref must not move with it.
    expect(first.refs[2]).toBe(second.refs[0]);
    expect(first.refs[1]).toBe(second.refs[1]);
    expect(first.refs[0]).toBe(second.refs[2]);
    expect(second.carryOverRate).toBe(1);
    expect(second.degraded).toBe(false);
  });

  it('gives a genuinely new element a fresh number without disturbing the others', () => {
    const registry = createRefRegistry('http://fixture/');
    const first = assignStableRefs(disambiguate([node('Claim A', [[0]]), node('Claim B', [[1]])].map(nodeHash)), registry);
    const second = assignStableRefs(
      disambiguate([node('Claim A', [[0]]), node('Claim B', [[1]]), node('Claim C', [[2]])].map(nodeHash)),
      registry,
    );
    expect(second.refs.slice(0, 2)).toEqual(first.refs);
    expect(second.refs[2]).not.toBe(first.refs[0]);
    expect(second.refs[2]).not.toBe(first.refs[1]);
  });

  it('never recycles a retired element’s number onto a different element', () => {
    const registry = createRefRegistry('http://fixture/');
    const first = assignStableRefs(disambiguate([node('Old', [[0]]), node('Kept', [[1]])].map(nodeHash)), registry);
    // "Old" disappears; a different control appears in its place.
    const second = assignStableRefs(disambiguate([node('Kept', [[0]]), node('Fresh', [[1]])].map(nodeHash)), registry);
    const oldRef = first.refs[0];
    expect(second.refs).not.toContain(oldRef);
  });

  it('separates duplicate controls by occurrence, deterministically', () => {
    const keys = disambiguate(['button|button|Add to cart|', 'button|button|Add to cart|']);
    expect(keys[0]).not.toBe(keys[1]);
    const registry = createRefRegistry('http://fixture/');
    const a = assignStableRefs(keys, registry);
    const b = assignStableRefs(keys, registry);
    expect(b.refs).toEqual(a.refs);
    expect(new Set(a.refs).size).toBe(2);
  });

  it('degrades to a clean ref space when a page rewrites itself wholesale', () => {
    const registry = createRefRegistry('http://fixture/');
    assignStableRefs(disambiguate(['a', 'b', 'c', 'd']), registry);
    const rewritten = assignStableRefs(disambiguate(['w', 'x', 'y', 'z']), registry);
    expect(rewritten.carryOverRate).toBeLessThan(MIN_CARRY_OVER_RATE);
    expect(rewritten.degraded).toBe(true);
  });

  it('does not call the FIRST snapshot a degradation (identity has to start somewhere)', () => {
    const first = assignStableRefs(disambiguate(['a', 'b']), createRefRegistry('http://fixture/'));
    expect(first.degraded).toBe(false);
    expect(first.carryOverRate).toBe(0);
  });

  it('exposes the registry as a flat table for boundary validation', () => {
    const registry = createRefRegistry('http://fixture/');
    assignStableRefs(disambiguate(['a', 'b']), registry);
    expect(registryTable(registry)).toEqual([
      { key: 'a#0', ref: 1 },
      { key: 'b#0', ref: 2 },
    ]);
  });

  it('identity ignores the structural path, which is what makes it survive a re-render', () => {
    // Deliberate: parseDomTree's hashes are the content keys assignment is built on.
    const parsed = parseDomTree({
      url: 'http://fixture/',
      title: 't',
      nodes: [node('Same', [[0]]), node('Same', [[9, 9, 9]])],
    });
    expect(parsed.hashes[0]).toBe(parsed.hashes[1]);
  });
});
