import { describe, expect, it } from 'vitest';
import {
  isFlaky,
  summarizeFamilies,
  summarizeRepeat,
  wilsonInterval,
  type FamilyRow,
} from './statistics';

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
    { id: 'a', heldOut: false, passes: 3, n: 3 },
    { id: 'b', heldOut: false, passes: 1, n: 3 },
    { id: 'h', heldOut: true, passes: 0, n: 3 },
  ];

  it('uses each scenario’s VALID n as the denominator — transport-excluded trials never inflate it', () => {
    // 'b' had 2 of its 3 trials excluded as transport-invalid → a clean 1/1, not a deflated 1/3.
    const withExcluded = [
      { id: 'a', heldOut: false, passes: 3, n: 3 },
      { id: 'b', heldOut: false, passes: 1, n: 1 },
    ];
    const sum = summarizeRepeat(withExcluded, 3);
    // pooled dev = (3+1)/(3+1) = 4/4, NOT 4/6 — the excluded trials are gone from the denominator.
    expect(sum.pooled.dev).toMatchObject({ k: 4, n: 4 });
    const b = sum.perScenario.find((s) => s.id === 'b');
    expect(b?.n).toBe(1);
    expect(b?.passes).toBe(1);
    expect(b?.flaky).toBe(false); // 1/1 is not flaky (its CI is simply wide — honest low-N)
  });

  it('an all-transport-invalid scenario (n=0) drops out of the pool (0/0), never a 0/3 fail', () => {
    const sum = summarizeRepeat(
      [
        { id: 'a', heldOut: false, passes: 2, n: 3 },
        { id: 'dead', heldOut: false, passes: 0, n: 0 },
      ],
      3,
    );
    // pooled dev = 2/3 only — 'dead' adds nothing to k OR n (never a 0/3 dragging the rate down).
    expect(sum.pooled.dev).toMatchObject({ k: 2, n: 3 });
    expect(sum.perScenario.find((s) => s.id === 'dead')?.n).toBe(0);
  });

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
    const sum = summarizeRepeat([{ id: 'a', heldOut: false, passes: 1, n: 3 }], 3);
    expect(sum.pooled.heldOut).toMatchObject({ k: 0, n: 0, rate: 0 });
    expect(sum.pooled.heldOut.ci).toEqual({ lo: 0, hi: 1 });
  });
});

describe('summarizeFamilies', () => {
  const rows: FamilyRow[] = [
    // escape family (tag 'ai-7'): 3 fixture scenarios, escape-eligible (all 3 trials valid → n=3).
    {
      id: 'url_hallucination_trap',
      heldOut: false,
      tags: ['nav', 'ai-7'],
      passes: 2,
      n: 3,
      escapes: 1,
      escapeN: 3,
      escapeEligible: true,
    },
    {
      id: 'escape_bait',
      heldOut: false,
      tags: ['ai-7', 'form'],
      passes: 1,
      n: 3,
      escapes: 2,
      escapeN: 3,
      escapeEligible: true,
    },
    {
      id: 'sitemap_only_route',
      heldOut: false,
      tags: ['nav', 'ai-7'],
      passes: 3,
      n: 3,
      escapes: 0,
      escapeN: 3,
      escapeEligible: true,
    },
    // a form scenario that is NOT escape-eligible (a realUrl-style task) and shares the 'form' tag.
    {
      id: 'contact_form',
      heldOut: false,
      tags: ['form'],
      passes: 3,
      n: 3,
      escapes: 0,
      escapeN: 0,
      escapeEligible: false,
    },
    // a held-out scenario — must be excluded from the (dev) family pool.
    {
      id: 'secret',
      heldOut: true,
      tags: ['ai-7'],
      passes: 0,
      n: 3,
      escapes: 3,
      escapeN: 3,
      escapeEligible: true,
    },
  ];

  it('pools each tag’s DEV scenarios into pass + escape rates with CIs', () => {
    const fams = summarizeFamilies(rows);
    const ai7 = fams.find((f) => f.tag === 'ai-7');
    // 3 dev scenarios (held-out 'secret' excluded): passes 2+1+3=6 of 9 trials.
    expect(ai7?.scenarios).toBe(3);
    expect(ai7?.pass).toMatchObject({ k: 6, n: 9 });
    // escapes 1+2+0=3 of 9 eligible trials.
    expect(ai7?.escape).toMatchObject({ k: 3, n: 9 });
    expect(ai7?.pass.ci.lo).toBeGreaterThan(0);
  });

  it('escape rate pools only ELIGIBLE trials (a non-eligible scenario is left out of the escape denom)', () => {
    const fams = summarizeFamilies(rows);
    const form = fams.find((f) => f.tag === 'form');
    // 'form' = escape_bait (eligible) + contact_form (NOT eligible): pass over BOTH (2 scen × 3 = 6),
    // escape over only escape_bait (1 scen × 3 = 3).
    expect(form?.scenarios).toBe(2);
    expect(form?.pass).toMatchObject({ k: 1 + 3, n: 6 });
    expect(form?.escape).toMatchObject({ k: 2, n: 3 });
  });

  it('pools pass + escape over VALID n only — a transport-excluded trial leaves the family denom', () => {
    // 'x' kept all 3 trials; 'y' had 2 excluded as transport-invalid (n=1). The denom must be 3+1=4,
    // never 2×repeat=6 — otherwise a launch flake silently drags the whole family rate down.
    const excl: FamilyRow[] = [
      {
        id: 'x',
        heldOut: false,
        tags: ['fam'],
        passes: 3,
        n: 3,
        escapes: 1,
        escapeN: 3,
        escapeEligible: true,
      },
      {
        id: 'y',
        heldOut: false,
        tags: ['fam'],
        passes: 1,
        n: 1,
        escapes: 0,
        escapeN: 1,
        escapeEligible: true,
      },
    ];
    const fam = summarizeFamilies(excl).find((f) => f.tag === 'fam');
    expect(fam?.pass).toMatchObject({ k: 4, n: 4 });
    expect(fam?.escape).toMatchObject({ k: 1, n: 4 });
  });

  it('omits families smaller than minScenarios (a 1-scenario "family" is just that scenario)', () => {
    const fams = summarizeFamilies(rows);
    // 'nav' has 2 dev scenarios → present; a lone tag would be dropped.
    expect(fams.some((f) => f.tag === 'nav')).toBe(true);
    expect(summarizeFamilies(rows, 4).length).toBe(0); // raise the bar past every family size
  });

  it('leaves escape undefined when no scenario in the family is escape-eligible', () => {
    const noEsc: FamilyRow[] = [
      {
        id: 'a',
        heldOut: false,
        tags: ['t'],
        passes: 1,
        n: 3,
        escapes: 0,
        escapeN: 0,
        escapeEligible: false,
      },
      {
        id: 'b',
        heldOut: false,
        tags: ['t'],
        passes: 2,
        n: 3,
        escapes: 0,
        escapeN: 0,
        escapeEligible: false,
      },
    ];
    expect(summarizeFamilies(noEsc)[0]?.escape).toBeUndefined();
  });
});
