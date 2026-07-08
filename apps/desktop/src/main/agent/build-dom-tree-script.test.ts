import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { MAX_INTERACTABLE_ELEMENTS } from '@tepegoz/tool-executor';
import { buildDomTreeExpression } from './build-dom-tree-script.js';

/**
 * The perception script runs in a real page (isolated world) and needs a DOM + layout, so its
 * behaviour is exercised by the AI-1 eval harness, not here. These tests are the cheap guard against
 * shipping a syntactically broken injection string: `vm.Script` COMPILES the expression without
 * running it, so a typo in the template literal fails fast in CI.
 */
describe('buildDomTreeExpression', () => {
  it('produces a syntactically valid, self-contained JS expression', () => {
    const expr = buildDomTreeExpression();
    expect(() => new vm.Script(`(${expr})`)).not.toThrow();
  });

  it('is an IIFE (evaluatable expression, not a statement)', () => {
    const expr = buildDomTreeExpression();
    expect(expr.trimStart().startsWith('(')).toBe(true);
    expect(expr.trimEnd().endsWith(')')).toBe(true);
  });

  it('interpolates the shared element cap so the emit cap tracks it', () => {
    expect(buildDomTreeExpression()).toContain(`EMIT_CAP = ${String(MAX_INTERACTABLE_ELEMENTS + 100)}`);
  });
});
