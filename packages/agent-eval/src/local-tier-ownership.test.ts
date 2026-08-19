import { describe, expect, it } from 'vitest';
import {
  EQUIVALENCE_MARGIN_PP,
  LOCAL_CANDIDATE_CAPABILITIES,
  MEASURED_LOCAL_OWNERSHIP,
  MIN_OWNERSHIP_TRIALS,
  ownershipLines,
  ownsLocally,
  shipsLocally,
  type EquivalenceEvidence,
} from './local-tier-ownership';

const evidence = (over: Partial<EquivalenceEvidence> = {}): EquivalenceEvidence => ({
  capability: 'classify',
  cloudRate: 0.8,
  localRate: 0.78,
  trials: 20,
  ...over,
});

describe('handing a tier to the on-device model', () => {
  it('REFUSES without a measurement — there is no "probably fine" path', () => {
    // The cheap tiers are exactly where a silent quality loss goes unnoticed longest, because nobody
    // inspects a classify call.
    expect(ownsLocally(undefined)).toEqual({ owns: false, reason: 'unmeasured', deltaPp: null });
  });

  it('refuses a match built on too few trials', () => {
    // Three trials that happen to agree say nothing about a tier that then runs unattended forever.
    const thin = evidence({ trials: MIN_OWNERSHIP_TRIALS - 1 });
    expect(ownsLocally(thin).owns).toBe(false);
    expect(ownsLocally(thin).reason).toBe('too_few_trials');
  });

  it('refuses a real quality loss', () => {
    expect(ownsLocally(evidence({ localRate: 0.6 })).reason).toBe('quality_loss');
  });

  it('accepts a loss INSIDE the margin', () => {
    const marginal = evidence({ cloudRate: 0.8, localRate: 0.8 - EQUIVALENCE_MARGIN_PP / 100 });
    expect(ownsLocally(marginal).owns).toBe(true);
  });

  it('is one-sided: local scoring HIGHER is not a reason to refuse it the tier', () => {
    // Unlike the speed guardrail, where a jump means the arms differed in more than speed. Here a
    // better local score is a reason to look at the exam, not a quality loss to guard against.
    expect(ownsLocally(evidence({ localRate: 0.95 })).owns).toBe(true);
  });
});

describe('the shipped table', () => {
  it('is EMPTY, which is the honest state — no local model has driven a decision through this harness', () => {
    expect(Object.keys(MEASURED_LOCAL_OWNERSHIP)).toEqual([]);
    for (const c of LOCAL_CANDIDATE_CAPABILITIES) {
      expect(shipsLocally(c), `capability=${c}`).toBe(false);
    }
  });

  it('never lists `plan` as a candidate — that tier stays frontier until something says otherwise', () => {
    expect(LOCAL_CANDIDATE_CAPABILITIES).not.toContain('plan');
  });

  it('prints the empty table as "none measured", never as an implicit "none needed"', () => {
    expect(ownershipLines().join('\n')).toContain('none measured');
  });
});
