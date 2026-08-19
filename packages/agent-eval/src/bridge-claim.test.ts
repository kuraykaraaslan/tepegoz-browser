import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_LOWER_BOUND_TARGET,
  MIN_CALIBRATION_LABELS,
  bridgeClaim,
  bridgeLines,
  type BridgeTrial,
} from './bridge-claim';

const trial = (over: Partial<BridgeTrial> = {}): BridgeTrial => ({
  scenarioId: 's',
  turkishWeb: false,
  verified: true,
  ...over,
});

const calibrated = { n: 25, agreements: 23, rate: 23 / 25, disagreements: [] };

describe('the publish gate', () => {
  it('REFUSES to publish a number scored by an uncalibrated judge', () => {
    // The Never-list bans auto-judge headlines. Enforced here rather than remembered: one human label
    // is not a check, and the run does not get to argue.
    const claim = bridgeClaim([trial(), trial()], { n: 1, agreements: 1, rate: 1, disagreements: [] }, 1);
    expect(claim.publishable).toBe(false);
    expect(claim.blockers.join(' ')).toContain('calibration');
  });

  it('refuses when agreement was never computed, even with enough labels on disk', () => {
    // A calibration file can exist and overlap this run in zero scenarios. That is not calibration.
    const claim = bridgeClaim([trial()], { n: 0, agreements: 0, rate: 1, disagreements: [] }, 30);
    expect(claim.publishable).toBe(false);
    expect(claim.blockers.join(' ')).toContain('agreement');
  });

  it('refuses an empty stratum, and reports null rather than 0%', () => {
    const claim = bridgeClaim([], calibrated, 30);
    expect(claim.publishable).toBe(false);
    expect(claim.whole.rate).toBeNull();
    expect(bridgeLines(claim).join('\n')).toContain('not measured');
  });

  it('publishes once the preconditions are actually met', () => {
    const claim = bridgeClaim([trial(), trial(), trial()], calibrated, MIN_CALIBRATION_LABELS);
    expect(claim.publishable).toBe(true);
    expect(claim.blockers).toEqual([]);
  });

  it('publishes a BAD number too — Version 1 ships win or lose', () => {
    // The target is a deliverable, not a threshold to defend. A run that misses it is still published,
    // which is what removes the incentive to tune the fixtures toward a headline.
    const claim = bridgeClaim(
      [trial({ verified: false }), trial({ verified: false }), trial()],
      calibrated,
      30,
    );
    expect(claim.publishable).toBe(true);
    expect(claim.meetsFirstRunTarget).toBe(false);
    expect(bridgeLines(claim).join('\n')).toContain('published anyway');
  });
});

describe('the numbers', () => {
  it('reports the Turkish-web sub-stratum separately, never folded into the whole', () => {
    const claim = bridgeClaim(
      [trial(), trial({ turkishWeb: true, verified: false }), trial({ turkishWeb: true })],
      calibrated,
      30,
    );
    expect(claim.whole.n).toBe(3);
    expect(claim.turkishWeb.n).toBe(2);
    expect(claim.turkishWeb.verified).toBe(1);
  });

  it('excludes transport-invalid trials from every denominator, and says how many', () => {
    // A dead key or a network flake is not a competence result. Scoring it as a failure would make the
    // number a measure of the harness rather than of the agent.
    const claim = bridgeClaim(
      [trial(), trial({ transportInvalid: true }), trial({ transportInvalid: true })],
      calibrated,
      30,
    );
    expect(claim.whole.n).toBe(1);
    expect(claim.excluded).toBe(2);
    expect(bridgeLines(claim).join('\n')).toContain('excluded: 2');
  });

  it('judges the first-run target on the CI LOWER BOUND, not the point estimate', () => {
    // 3/3 is a 100% point estimate and a Wilson lower bound around 44% — nowhere near the target. A
    // point estimate from three trials is not evidence, and this is where that gets enforced.
    const claim = bridgeClaim([trial(), trial(), trial()], calibrated, 30);
    expect(claim.whole.rate).toBe(1);
    expect(claim.meetsFirstRunTarget).toBe(false);
    expect(claim.whole.loCI).toBeLessThan(FIRST_RUN_LOWER_BOUND_TARGET);
  });

  it('meets the target once there are enough trials behind the rate', () => {
    const claim = bridgeClaim(Array.from({ length: 30 }, () => trial()), calibrated, 30);
    expect(claim.meetsFirstRunTarget).toBe(true);
  });
});
