import { describe, expect, it } from 'vitest';
import { cadenceBounds, shouldValidate, type ValidationCadenceState } from './should-validate';

const bounds = cadenceBounds(3); // floor 3, ceiling 6 — the old fixed interval is the floor

const state = (over: Partial<ValidationCadenceState> = {}): ValidationCadenceState => ({
  actionsSinceValidation: 3,
  sigAtLastValidation: 'sig-a',
  currentSig: 'sig-a',
  ...over,
});

describe('adaptive validation cadence', () => {
  it('validates when the perceived world has moved', () => {
    expect(shouldValidate(state({ currentSig: 'sig-b' }), bounds)).toEqual({
      validate: true,
      reason: 'page_changed',
    });
  });

  it('SKIPS when nothing has changed — the old modulo spent a round-trip here', () => {
    expect(shouldValidate(state(), bounds).validate).toBe(false);
  });

  it('NEVER validates more often than the old fixed interval, however churny the page', () => {
    // The floor is the whole safety argument: a live ticker whose signature moves every step would
    // otherwise turn this optimisation into a cost regression on the busiest-looking pages. With the
    // floor pinned to the old interval the worst case is exactly today's behaviour.
    for (let n = 0; n < bounds.floor; n++) {
      const churny = state({ actionsSinceValidation: n, currentSig: `sig-${String(n)}` });
      expect(shouldValidate(churny, bounds)).toEqual({ validate: false, reason: 'below_floor' });
    }
  });

  it('validates at the ceiling even when the signature is stuck — a frozen page still gets judged', () => {
    expect(shouldValidate(state({ actionsSinceValidation: bounds.ceiling }), bounds)).toEqual({
      validate: true,
      reason: 'ceiling',
    });
  });

  it('holds between the floor and the ceiling while the page is unchanged', () => {
    expect(
      shouldValidate(state({ actionsSinceValidation: bounds.ceiling - 1 }), bounds).reason,
    ).toBe('page_unchanged');
  });

  it('treats a never-validated signature as changed, so the first pass still happens', () => {
    expect(shouldValidate(state({ sigAtLastValidation: null }), bounds).validate).toBe(true);
  });

  it('does not validate on an unperceived world rather than guessing it changed', () => {
    // No read has landed yet: there is no evidence to judge, so the ceiling is the only trigger.
    expect(
      shouldValidate(state({ currentSig: null, sigAtLastValidation: null }), bounds).validate,
    ).toBe(false);
  });

  it('derives its bounds from the existing interval — no new budget to tune', () => {
    expect(cadenceBounds(3)).toEqual({ floor: 3, ceiling: 6 });
    expect(cadenceBounds(0)).toEqual({ floor: 1, ceiling: 2 });
  });
});
