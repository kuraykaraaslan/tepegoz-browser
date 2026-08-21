import { describe, expect, it } from 'vitest';
import { assembleEvidence, classifyClaim, describeEvidence } from './completion-evidence';
import type { StepOutcome } from './executor';

function step(tool: string, result: unknown, ok = true): StepOutcome {
  return { stepId: 's', tool, ok, result, durationMs: 1 };
}

/** The exact shape `browser_update_page` returns for a save the server rejected. */
const savedButRejected = step('browser_update_page', {
  ok: true,
  changed: true,
  networkWarning: 'POST /__status/500 returned 500',
});

describe('assembling evidence from a run', () => {
  it('records a failed request as CONTRADICTING, whatever the page did', () => {
    // The `saved-but-500` shape: the page changed and looks saved, and the request failed.
    const evidence = assembleEvidence([savedButRejected]);
    expect(evidence.mutating).toBe(true);
    expect(evidence.items.map((i) => i.verdict)).toEqual(['contradicts']);
    expect(classifyClaim(evidence)).toBe('contradicted');
  });

  it('treats a mutating action that changed nothing as inconclusive, not as failure', () => {
    const evidence = assembleEvidence([step('browser_update_page', { ok: true, changed: false })]);
    expect(evidence.items[0]?.verdict).toBe('inconclusive');
    // Absence of evidence is not evidence of absence — but it is certainly not verification.
    expect(classifyClaim(evidence)).toBe('attempted_unverified');
  });

  it('treats a refused click as inconclusive rather than as a completed action', () => {
    const evidence = assembleEvidence([
      step('browser_update_page', { ok: true, changed: false, occludedBy: '<div> "cookies"' }),
    ]);
    expect(evidence.items[0]?.detail).toContain('refused');
    expect(classifyClaim(evidence)).toBe('attempted_unverified');
  });

  it('lets a passing page check support a claim', () => {
    const evidence = assembleEvidence([
      step('browser_update_page', { ok: true, changed: true }),
      step('browser_validate_page', { ok: true }),
    ]);
    expect(classifyClaim(evidence)).toBe('verified');
  });

  it('does not let a page check that did NOT hold support a claim', () => {
    const evidence = assembleEvidence([
      step('browser_update_page', { ok: true, changed: false }),
      step('browser_validate_page', { ok: false }),
    ]);
    expect(classifyClaim(evidence)).toBe('attempted_unverified');
  });

  it('verifies a pure read task, which has nothing to verify against the network', () => {
    const evidence = assembleEvidence([step('browser_get_page', { content: 'the price is 42' })]);
    expect(evidence.mutating).toBe(false);
    expect(classifyClaim(evidence)).toBe('verified');
  });

  it('records a failed step as inconclusive, not as a contradiction', () => {
    // A tool that errored says nothing about whether the goal was met — only that this step was not it.
    const evidence = assembleEvidence([
      {
        stepId: 's',
        tool: 'browser_update_page',
        ok: false,
        error: { code: 'FORBIDDEN', message: 'denied', isError: true, retryable: false },
        durationMs: 1,
      },
    ]);
    expect(evidence.items[0]?.verdict).toBe('inconclusive');
  });

  it('contradicts when the page is no longer the origin the run acted on', () => {
    const evidence = assembleEvidence([step('browser_update_page', { ok: true, changed: true })], {
      urlMatch: { expected: 'http://127.0.0.1:1/', actual: 'http://127.0.0.1:2/' },
    });
    expect(classifyClaim(evidence)).toBe('contradicted');
  });

  it('only considers the recent tail — an old step says nothing about the last save', () => {
    const old = Array.from({ length: 20 }, () => savedButRejected);
    const evidence = assembleEvidence([...old, step('browser_get_page', {})], { tail: 1 });
    expect(evidence.items).toEqual([]);
    expect(evidence.mutating).toBe(false);
  });

  it('caps the bundle so a long run cannot flood the settle step', () => {
    const many = Array.from({ length: 120 }, () => savedButRejected);
    expect(assembleEvidence(many, { tail: 120 }).items.length).toBeLessThanOrEqual(50);
  });
});

describe('classifyClaim at the boundary', () => {
  it('treats an unparseable bundle as NO evidence, never as verification', () => {
    const bad = {
      mutating: true,
      items: [{ id: '', kind: 'network', verdict: 'nope', detail: '' }],
    } as never;
    expect(classifyClaim(bad)).toBe('attempted_unverified');
  });
});

describe('describeEvidence', () => {
  it('says plainly when a state-changing run recorded nothing', () => {
    expect(describeEvidence({ mutating: true, items: [] })).toContain('NONE recorded');
  });

  it('does not imply a read task is missing evidence it never needed', () => {
    expect(describeEvidence({ mutating: false, items: [] })).toContain('none needed');
  });

  it('cites each record by id so a verdict can be traced back to it', () => {
    const evidence = assembleEvidence([savedButRejected]);
    expect(describeEvidence(evidence)).toContain('browser_update_page#0:net');
  });
});
