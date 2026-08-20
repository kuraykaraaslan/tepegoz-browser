import { describe, expect, it } from 'vitest';
import type { PolicyBundle } from '@tepegoz/shared-types';
import { bundleChainNarrows, bundleNarrows } from './policy-bundle-narrowing';

const bundle = (over: Partial<PolicyBundle> = {}): PolicyBundle => ({
  id: 'b1',
  name: 'Test',
  version: '1.0.0',
  allowedToolIds: ['browser_get_page', 'browser_update_page'],
  allowedDomains: null,
  ...over,
});

describe('bundleNarrows', () => {
  it('an identical bundle narrows itself', () => {
    const b = bundle();
    expect(bundleNarrows(b, b)).toEqual({ narrows: true });
  });

  it('a child with FEWER tools narrows its parent', () => {
    const parent = bundle({ allowedToolIds: ['a', 'b', 'c'] });
    const child = bundle({ allowedToolIds: ['a'] });
    expect(bundleNarrows(parent, child)).toEqual({ narrows: true });
  });

  it('a child that ADDS a tool the parent never granted is refused, naming the tool', () => {
    const parent = bundle({ allowedToolIds: ['a'] });
    const child = bundle({ allowedToolIds: ['a', 'b'] });
    expect(bundleNarrows(parent, child)).toEqual({
      narrows: false,
      violations: [{ kind: 'tool_added', toolId: 'b' }],
    });
  });

  it('a parent with NO domain restriction cannot be widened on that axis by any child', () => {
    const parent = bundle({ allowedDomains: null });
    const child = bundle({ allowedDomains: ['anything.test'] });
    expect(bundleNarrows(parent, child)).toEqual({ narrows: true });
  });

  it('a child that REMOVES the parent’s domain restriction entirely is refused, as its own violation kind', () => {
    const parent = bundle({ allowedDomains: ['shop.test'] });
    const child = bundle({ allowedDomains: null });
    expect(bundleNarrows(parent, child)).toEqual({
      narrows: false,
      violations: [{ kind: 'domain_restriction_removed' }],
    });
  });

  it('a child that adds a domain outside the parent’s list is refused, naming the domain', () => {
    const parent = bundle({ allowedDomains: ['shop.test'] });
    const child = bundle({ allowedDomains: ['shop.test', 'evil.test'] });
    expect(bundleNarrows(parent, child)).toEqual({
      narrows: false,
      violations: [{ kind: 'domain_added', domain: 'evil.test' }],
    });
  });

  it('a child that keeps a SUBSET of the parent’s domains narrows cleanly', () => {
    const parent = bundle({ allowedDomains: ['shop.test', 'bank.test'] });
    const child = bundle({ allowedDomains: ['shop.test'] });
    expect(bundleNarrows(parent, child)).toEqual({ narrows: true });
  });

  it('domain comparison is case-insensitive', () => {
    const parent = bundle({ allowedDomains: ['Shop.Test'] });
    const child = bundle({ allowedDomains: ['shop.test'] });
    expect(bundleNarrows(parent, child)).toEqual({ narrows: true });
  });

  it('collects MULTIPLE violations in one pass — an author sees everything wrong at once', () => {
    const parent = bundle({ allowedToolIds: ['a'], allowedDomains: ['shop.test'] });
    const child = bundle({ allowedToolIds: ['a', 'evil_tool'], allowedDomains: ['shop.test', 'evil.test'] });
    const v = bundleNarrows(parent, child);
    expect(v.narrows).toBe(false);
    if (!v.narrows) expect(v.violations).toHaveLength(2);
  });
});

describe('bundleChainNarrows', () => {
  it('confirms a whole chain where every link narrows', () => {
    const root = bundle({ allowedToolIds: ['a', 'b', 'c'] });
    const mid = bundle({ id: 'b2', allowedToolIds: ['a', 'b'] });
    const leaf = bundle({ id: 'b3', allowedToolIds: ['a'] });
    expect(bundleChainNarrows([root, mid, leaf])).toEqual({ narrows: true });
  });

  it('catches a violation at ANY link, not just the first or the last', () => {
    const root = bundle({ allowedToolIds: ['a', 'b'] });
    const mid = bundle({ id: 'b2', allowedToolIds: ['a', 'b', 'sneaky'] }); // widens here
    const leaf = bundle({ id: 'b3', allowedToolIds: ['a'] }); // narrows the (already-bad) mid
    const v = bundleChainNarrows([root, mid, leaf]);
    expect(v.narrows).toBe(false);
    if (!v.narrows) expect(v.violations).toEqual([{ kind: 'tool_added', toolId: 'sneaky' }]);
  });

  it('is vacuously true for a chain of one — nothing to compare against', () => {
    expect(bundleChainNarrows([bundle()])).toEqual({ narrows: true });
  });
});
