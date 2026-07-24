import { describe, expect, it } from 'vitest';
import { isFlaky, summarizeRepeat, wilsonInterval } from './statistics';

describe('wilsonInterval', () => {
  it('returns total ignorance ({0,1}) for n=0 — never fake certainty', () => {
    expect(wilsonInterval(0, 0)).toEqual({ lo: 0, hi: 1 });
  });

  it('matches the known Wilson 95% interval for 1/3', () => {
    // Reference value (Wilson score, z=1.96): 1/3 → [0.0617, 0.7923].
    const { lo, hi } = wilsonInterval(1, 3);
    expect(lo).toBeCloseTo(0.0617, 3);
    expect(hi).toBeCloseTo(0.7923, 3);
  });

  it('stays inside [0,1] at the k=0 and k=n edges (where an agent eval lives)', () => {
    const zero = wilsonInterval(0, 10);
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeGreaterThan(0);
    expect(zero.hi).toBeLessThan(0.35);
    const all = wilsonInterval(10, 10);
    expect(all.hi).toBe(1);
    expect(all.lo).toBeGreaterThan(0.65);
  });

  it('narrows with n — 6/10 is a tighter claim than 2/3 despite a similar rate', () => {
    const small = wilsonInterval(2, 3);
    const large = wilsonInterval(6, 10);
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo);
  });
});

describe('isFlaky', () => {
  it('tags only mixed outcomes (0<k<n)', () => {
    expect(isFlaky(0, 3)).toBe(false);
    expect(isFlaky(3, 3)).toBe(false);
    expect(isFlaky(1, 3)).toBe(true);
    expect(isFlaky(2, 3)).toBe(true);
    // A single trial can never be flaky evidence.
    expect(isFlaky(1, 1)).toBe(false);
  });
});

describe('summarizeRepeat', () => {
  const freq = [
    { id: 'a', heldOut: false, passes: 3 },
    { id: 'b', heldOut: false, passes: 1 },
    { id: 'h', heldOut: true, passes: 0 },
  ];

  it('pools per-trial passes into dev/held-out aggregates with CIs', () => {
    const sum = summarizeRepeat(freq, 3);
    // dev: a(3/3) + b(1/3) = 4/6; held-out: 0/3.
    expect(sum.pooled.dev).toMatchObject({ k: 4, n: 6 });
    expect(sum.pooled.dev.rate).toBeCloseTo(4 / 6, 10);
    expect(sum.pooled.heldOut).toMatchObject({ k: 0, n: 3 });
    expect(sum.pooled.dev.ci.lo).toBeGreaterThan(0);
    expect(sum.pooled.dev.ci.hi).toBeLessThan(1);
  });

  it('tags per-scenario flakiness and confirms it only across two sweeps', () => {
    const prior = new Map([
      ['b', { passes: 2, n: 3 }], // flaky in the prior sweep too → confirmed
      ['a', { passes: 3, n: 3 }],
    ]);
    const sum = summarizeRepeat(freq, 3, prior);
    const byId = new Map(sum.perScenario.map((s) => [s.id, s]));
    expect(byId.get('a')?.flaky).toBe(false);
    expect(byId.get('b')?.flaky).toBe(true);
    expect(byId.get('b')?.flakyConfirmed).toBe(true);
    // No prior data for 'h' → no confirmation claim either way.
    expect(byId.get('h')?.flakyConfirmed).toBeUndefined();
  });

  it('a scenario flaky now but clean in the prior sweep is NOT confirmed', () => {
    const prior = new Map([['b', { passes: 3, n: 3 }]]);
    const sum = summarizeRepeat(freq, 3, prior);
    expect(sum.perScenario.find((s) => s.id === 'b')?.flakyConfirmed).toBe(false);
  });

  it('handles an empty tier without dividing by zero', () => {
    const sum = summarizeRepeat([{ id: 'a', heldOut: false, passes: 1 }], 3);
    expect(sum.pooled.heldOut).toMatchObject({ k: 0, n: 0, rate: 0 });
    expect(sum.pooled.heldOut.ci).toEqual({ lo: 0, hi: 1 });
  });
});
