import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingApprovals, pendingPlans, settleApproval, settlePlan } from './hitl-registry';

vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn() } }));

/**
 * Regression guard for the autonomy-enforcement fix (S6-PR1): the renderer is untrusted, so a response
 * is applied ONLY if it correlates to a request main actually minted.
 */
describe('HITL registry — a renderer cannot answer what main did not ask', () => {
  beforeEach(() => {
    pendingApprovals.clear();
    pendingPlans.clear();
  });

  it('rejects an approval for an id main never minted', () => {
    const applied = settleApproval('appr-not-a-real-id', true);
    expect(applied).toBe(false);
  });

  it('rejects a plan response for an id main never minted', () => {
    expect(settlePlan('plan-not-a-real-id', true)).toBe(false);
  });

  it('rejects a spray of guessed sequential ids — the shape the old counter was vulnerable to', () => {
    const guesses = Array.from({ length: 100 }, (_, i) => `appr-${String(i + 1)}`);
    const applied = guesses.filter((id) => settleApproval(id, true));
    expect(applied).toEqual([]);
  });

  it('does not let a pre-emptive spray settle a request minted afterwards', () => {
    // The renderer answers first, main asks second. The early response must be dropped, and the real
    // request must still be waiting for a genuine answer.
    expect(settleApproval('appr-later', true)).toBe(false);

    const resolve = vi.fn();
    pendingApprovals.set('appr-later', { runId: 'run-1', resolve });
    expect(resolve).not.toHaveBeenCalled();
    expect(pendingApprovals.has('appr-later')).toBe(true);
  });

  it('applies a correlated approval exactly once, then rejects the replay', () => {
    const resolve = vi.fn();
    pendingApprovals.set('appr-real', { runId: 'run-1', resolve });

    expect(settleApproval('appr-real', true)).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ approved: true, remember: false, grantScope: false });

    // A duplicated / replayed response finds nothing.
    expect(settleApproval('appr-real', true)).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('relays a denial faithfully — the renderer may say no as well as yes', () => {
    const resolve = vi.fn();
    pendingApprovals.set('appr-deny', { runId: 'run-1', resolve });

    expect(settleApproval('appr-deny', false)).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ approved: false, remember: false, grantScope: false });
  });

  it('carries the remember tick, and defaults it OFF when the renderer omits it', () => {
    // A missing field must never read as "yes, store a persistent grant".
    const resolve = vi.fn();
    pendingApprovals.set('appr-remember', { runId: 'run-1', resolve });
    expect(settleApproval('appr-remember', true, true)).toBe(true);
    expect(resolve).toHaveBeenCalledWith({ approved: true, remember: true, grantScope: false });

    const bare = vi.fn();
    pendingApprovals.set('appr-bare', { runId: 'run-1', resolve: bare });
    settleApproval('appr-bare', true);
    expect(bare).toHaveBeenCalledWith({ approved: true, remember: false, grantScope: false });
  });

  it('carries the run-scope tick, and defaults it OFF when the renderer omits it', () => {
    // Same rule as `remember`: a missing field must never read as "yes, widen what this run may do".
    const resolve = vi.fn();
    pendingApprovals.set('appr-scope', { runId: 'run-1', resolve });
    expect(settleApproval('appr-scope', true, false, true)).toBe(true);
    expect(resolve).toHaveBeenCalledWith({ approved: true, remember: false, grantScope: true });
  });

  it('settles a correlated plan once, carrying its skipped steps', () => {
    const resolve = vi.fn();
    pendingPlans.set('plan-real', { runId: 'run-1', resolve });

    expect(settlePlan('plan-real', true, ['s2'])).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ approved: true, skipStepIds: ['s2'] });

    expect(settlePlan('plan-real', true, ['s3'])).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('omits skipStepIds entirely when the renderer sent none', () => {
    const resolve = vi.fn();
    pendingPlans.set('plan-bare', { runId: 'run-1', resolve });

    settlePlan('plan-bare', true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ approved: true });
  });

  it('settling one request leaves other outstanding requests untouched', () => {
    const a = vi.fn();
    const b = vi.fn();
    pendingApprovals.set('appr-a', { runId: 'run-1', resolve: a });
    pendingApprovals.set('appr-b', { runId: 'run-1', resolve: b });

    settleApproval('appr-a', true);
    expect(b).not.toHaveBeenCalled();
    expect(pendingApprovals.has('appr-b')).toBe(true);
  });
});
