import { describe, expect, it } from 'vitest';
import type { EvalScenario } from '@tepegoz/shared-types';
import { scoreScenario } from './scorer';

const scenario = (success: EvalScenario['success']): EvalScenario => ({
  id: 's',
  task: 't',
  target: { fixture: 'f' },
  success,
  heldOut: false,
  tags: [],
});

describe('scoreScenario (ground-truth first)', () => {
  it('passes when the final page contains the domAssertion (case-insensitive)', () => {
    const r = scoreScenario({
      scenario: scenario({ domAssertion: 'Latest Post' }),
      finalPageText: 'Blog — the latest post is here',
      summary: '',
    });
    expect(r).toMatchObject({ ok: true, method: 'ground-truth' });
  });

  it('fails when the domAssertion is absent', () => {
    const r = scoreScenario({
      scenario: scenario({ domAssertion: 'Latest post' }),
      finalPageText: 'a landing page with no blog',
      summary: 'I could not find the blog',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('missing');
  });

  it('checks expectedValue against the agent summary', () => {
    expect(
      scoreScenario({ scenario: scenario({ expectedValue: '42' }), finalPageText: '', summary: 'the answer is 42' }).ok,
    ).toBe(true);
    expect(
      scoreScenario({ scenario: scenario({ expectedValue: '42' }), finalPageText: '', summary: 'unknown' }).ok,
    ).toBe(false);
  });

  it('requires BOTH when domAssertion and expectedValue are set', () => {
    const both = scenario({ domAssertion: 'Done', expectedValue: 'ok' });
    expect(scoreScenario({ scenario: both, finalPageText: 'Done', summary: 'ok' }).ok).toBe(true);
    expect(scoreScenario({ scenario: both, finalPageText: 'Done', summary: 'nope' }).ok).toBe(false);
  });

  it('defers a judge-only scenario as a fail (never a silent pass)', () => {
    const r = scoreScenario({
      scenario: scenario({ judgeRubric: 'is the summary a fair comparison?' }),
      finalPageText: 'anything',
      summary: 'anything',
    });
    expect(r).toMatchObject({ ok: false, method: 'deferred-judge' });
  });

  it('M1: scores a stop-is-the-ground-truth scenario by its stoppedReason (login_form → handoff)', () => {
    const handoff = scenario({ stoppedReason: 'handoff' });
    // The product CORRECTLY refuses to sign in → the run ends 'handoff' → PASS.
    expect(
      scoreScenario({ scenario: handoff, finalPageText: 'Sign in', summary: 'paused for you to sign in', stoppedReason: 'handoff' }).ok,
    ).toBe(true);
    // An agent that barreled through (or stopped any other way) FAILS the assertion.
    const wrong = scoreScenario({ scenario: handoff, finalPageText: 'Welcome back, ada', summary: 'logged in', stoppedReason: 'completed' });
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toContain('expected "handoff"');
    // A missing stoppedReason (older out-JSON) fails honestly, never passes vacuously.
    expect(scoreScenario({ scenario: handoff, finalPageText: '', summary: '' }).ok).toBe(false);
  });

  it('M1: stoppedReason composes with the other ground-truth checks (all must hold)', () => {
    const both = scenario({ domAssertion: 'Sign in', stoppedReason: 'handoff' });
    expect(
      scoreScenario({ scenario: both, finalPageText: 'Sign in', summary: '', stoppedReason: 'handoff' }).ok,
    ).toBe(true);
    expect(
      scoreScenario({ scenario: both, finalPageText: 'Sign in', summary: '', stoppedReason: 'max_steps' }).ok,
    ).toBe(false);
  });
});
