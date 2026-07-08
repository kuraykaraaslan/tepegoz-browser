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
});
