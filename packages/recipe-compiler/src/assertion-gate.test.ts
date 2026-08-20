import { describe, expect, it } from 'vitest';
import { shouldHaltOnFailure } from './assertion-gate';

describe('deciding whether a failed assertion halts the run', () => {
  it('never halts on a PASSED assertion, regardless of tier', () => {
    expect(shouldHaltOnFailure('hard', { passed: true })).toBe(false);
    expect(shouldHaltOnFailure('soft', { passed: true })).toBe(false);
  });

  it('halts on a hard-tier failure', () => {
    expect(shouldHaltOnFailure('hard', { passed: false, reason: 'x' })).toBe(true);
  });

  it('does NOT halt on a soft-tier (cosmetic) failure', () => {
    expect(shouldHaltOnFailure('soft', { passed: false, reason: 'x' })).toBe(false);
  });

  it('DEFAULTS an unmarked assertion to hard — an author who attached one almost certainly meant it', () => {
    expect(shouldHaltOnFailure(undefined, { passed: false, reason: 'x' })).toBe(true);
  });
});
