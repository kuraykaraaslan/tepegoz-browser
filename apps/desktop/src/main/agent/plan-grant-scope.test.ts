import { describe, expect, it } from 'vitest';
import type { Plan, RiskLevel } from '@tepegoz/shared-types';
import { planGrantScope } from './plan-grant-scope';

const CLASSES: Record<string, RiskLevel> = {
  browser_get_page: 'read',
  browser_update_page: 'state_changing',
  shop_create_order: 'financial',
  macro_delete_macro: 'destructive',
  web_search_items: 'read',
};
const lookup = (id: string): RiskLevel | undefined => CLASSES[id];

const plan = (steps: { tool: string; args?: unknown }[]): Plan => ({
  goal: 'g',
  steps: steps.map((s, i) => ({
    id: `s${String(i)}`,
    tool: s.tool,
    args: s.args ?? {},
    rationale: '',
    dependsOn: [],
  })),
});

describe('planGrantScope', () => {
  it('scopes to the entry page plus URLs found in step arguments', () => {
    const scope = planGrantScope(
      plan([{ tool: 'browser_update_page', args: { url: 'https://shop.com.tr/cart' } }]),
      'https://www.shop.com.tr/product',
      lookup,
    );
    expect(scope.urls).toContain('https://www.shop.com.tr/product');
    expect(scope.urls).toContain('https://shop.com.tr/cart');
  });

  it('derives tiers from the plan steps, not from a default', () => {
    const scope = planGrantScope(plan([{ tool: 'browser_update_page' }]), null, lookup);
    expect(scope.tiers).toEqual(['ui-write']);
  });

  it('carries the ungrantable tiers through — PlanGrantStore is what drops them', () => {
    // Keeping the derivation honest and the filtering in one place means a change to what is grantable
    // cannot be forgotten in a second location.
    const scope = planGrantScope(
      plan([{ tool: 'shop_create_order' }, { tool: 'macro_delete_macro' }]),
      null,
      lookup,
    );
    expect(scope.tiers).toContain('financial');
    expect(scope.tiers).toContain('destructive');
  });

  it('skips a step whose tool is not registered — an unknown tool never widens a grant', () => {
    const scope = planGrantScope(
      plan([{ tool: 'browser_update_page' }, { tool: 'mystery_update_thing' }]),
      null,
      lookup,
    );
    expect(scope.tiers).toEqual(['ui-write']);
  });

  it('classifies on arguments, so a password step is a credential tier', () => {
    const scope = planGrantScope(
      plan([{ tool: 'browser_update_page', args: { fields: { password: 'x' } } }]),
      null,
      lookup,
    );
    expect(scope.tiers).toEqual(['credential']);
  });

  it('handles an empty plan and a missing entry URL', () => {
    expect(planGrantScope(plan([]), null, lookup)).toEqual({ urls: [], tiers: [] });
  });

  it('deduplicates and stays bounded against a hostile plan', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      tool: 'browser_update_page',
      args: { note: `see https://site${String(i)}.example/x` },
    }));
    const scope = planGrantScope(plan(many), null, lookup);
    expect(scope.urls.length).toBeLessThanOrEqual(50);
    expect(scope.tiers).toEqual(['ui-write']);
  });

  it('ignores non-http schemes in arguments', () => {
    const scope = planGrantScope(
      plan([
        { tool: 'browser_update_page', args: { s: 'file:///etc/passwd javascript:alert(1)' } },
      ]),
      null,
      lookup,
    );
    expect(scope.urls).toEqual([]);
  });
});
