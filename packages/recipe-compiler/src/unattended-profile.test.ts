import { describe, expect, it } from 'vitest';
import {
  mayRunUnattended,
  narrowToUnattended,
  type InteractiveProfile,
} from './unattended-profile';

const profile = (...toolIds: string[]): InteractiveProfile => ({
  approvedToolIds: new Set(toolIds),
});

describe('may a step run unattended', () => {
  it('allows a READ step that was part of interactive authoring', () => {
    const v = mayRunUnattended(
      { toolId: 'browser_get_page', dangerClass: 'read' },
      profile('browser_get_page'),
    );
    expect(v).toEqual({ autoRun: true });
  });

  it('REFUSES a state_changing step with no pre-approval — the default is HITL, not auto-run', () => {
    const v = mayRunUnattended(
      { toolId: 'browser_update_page', dangerClass: 'state_changing' },
      profile('browser_update_page'),
    );
    expect(v).toEqual({ autoRun: false, reason: 'requires_hitl' });
  });

  it('allows a state_changing step ONLY when explicitly pre-approved at authoring time', () => {
    const v = mayRunUnattended(
      { toolId: 'browser_update_page', dangerClass: 'state_changing', preApprovedIdempotent: true },
      profile('browser_update_page'),
    );
    expect(v).toEqual({ autoRun: true });
  });

  it('NEVER auto-runs destructive, even if pre-approved — no override exists for this tier', () => {
    const v = mayRunUnattended(
      { toolId: 'file_delete_item', dangerClass: 'destructive', preApprovedIdempotent: true },
      profile('file_delete_item'),
    );
    expect(v).toEqual({ autoRun: false, reason: 'never_unattended_tier' });
  });

  it('NEVER auto-runs financial, even if pre-approved — real money faces a human every time', () => {
    const v = mayRunUnattended(
      { toolId: 'checkout_submit_payment', dangerClass: 'financial', preApprovedIdempotent: true },
      profile('checkout_submit_payment'),
    );
    expect(v).toEqual({ autoRun: false, reason: 'never_unattended_tier' });
  });

  it('REFUSES a tool the recipe never used interactively — the sealed-narrowing ceiling', () => {
    // Even a plain read: a tool outside what was actually authored has no standing to appear unattended.
    const v = mayRunUnattended({ toolId: 'browser_get_page', dangerClass: 'read' }, profile());
    expect(v).toEqual({ autoRun: false, reason: 'not_in_interactive_profile' });
  });

  it('checks the TIER ceiling before the interactive-profile ceiling', () => {
    // Even if a destructive tool somehow WAS in the interactive profile, the tier still wins — the
    // refusal reason names the tier, not the profile, so an investigator sees the real reason first.
    const v = mayRunUnattended(
      { toolId: 'file_delete_item', dangerClass: 'destructive' },
      profile('file_delete_item'),
    );
    expect(v.autoRun).toBe(false);
    if (!v.autoRun) expect(v.reason).toBe('never_unattended_tier');
  });
});

describe('narrowing a whole recipe', () => {
  it('produces a strict SUBSET of the interactive profile — the sealed-narrowing property, checked directly', () => {
    const interactive = profile('read_a', 'write_b', 'delete_c');
    const steps = [
      { toolId: 'read_a', dangerClass: 'read' as const },
      { toolId: 'write_b', dangerClass: 'state_changing' as const, preApprovedIdempotent: true },
      { toolId: 'delete_c', dangerClass: 'destructive' as const },
    ];
    const unattended = narrowToUnattended(steps, interactive);
    for (const id of unattended.autoRunToolIds) {
      expect(interactive.approvedToolIds.has(id), id).toBe(true);
    }
  });

  it('includes the read and pre-approved idempotent steps, and excludes the destructive one', () => {
    const interactive = profile('read_a', 'write_b', 'delete_c');
    const steps = [
      { toolId: 'read_a', dangerClass: 'read' as const },
      { toolId: 'write_b', dangerClass: 'state_changing' as const, preApprovedIdempotent: true },
      { toolId: 'delete_c', dangerClass: 'destructive' as const },
    ];
    const unattended = narrowToUnattended(steps, interactive);
    expect([...unattended.autoRunToolIds].sort()).toEqual(['read_a', 'write_b']);
  });

  it('produces an EMPTY set for a recipe with no auto-runnable steps, never guesses', () => {
    const interactive = profile('delete_c');
    const steps = [{ toolId: 'delete_c', dangerClass: 'destructive' as const }];
    expect(narrowToUnattended(steps, interactive).autoRunToolIds.size).toBe(0);
  });
});
