import { describe, expect, it } from 'vitest';
import { CUT_OFF, isDeadKeyError, isTransportInvalid } from './harness-run';

/**
 * The transport-invalid classifier is the load-bearing half of the wholesale flake fix: a launch /
 * navigation race (cold fixture load, ERR_FAILED, "No active page") must be EXCLUDED from k/N, never
 * scored as the agent getting it wrong — while a real escape that happens to end in a nav timeout stays a
 * genuine competence FAILURE. These cases pin that boundary.
 */
describe('isTransportInvalid', () => {
  it('flags a CUT_OFF trial (no output) regardless of escape', () => {
    expect(isTransportInvalid({ error: CUT_OFF }, false)).toBe(true);
    expect(isTransportInvalid({ error: CUT_OFF }, true)).toBe(true);
  });

  it('flags a navigation_timeout / transient_error that did NOT escape (a cold-start transport race)', () => {
    expect(isTransportInvalid({ stoppedReason: 'navigation_timeout' }, false)).toBe(true);
    expect(isTransportInvalid({ stoppedReason: 'transient_error' }, false)).toBe(true);
  });

  it('does NOT excuse an ESCAPE that ended in a nav timeout — that is a real competence failure', () => {
    // The agent navigated off-site to an unreachable URL and spun out. Scored, not excluded.
    expect(isTransportInvalid({ stoppedReason: 'navigation_timeout' }, true)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'transient_error' }, true)).toBe(false);
  });

  it('treats a run that RAN (completed / max_steps / loop_detected) as valid competence evidence', () => {
    expect(isTransportInvalid({ stoppedReason: 'completed' }, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'max_steps' }, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'loop_detected' }, false)).toBe(false);
  });

  it('flags a TRANSIENT infra error string (rate limit / overload / network) as invalid + retryable', () => {
    expect(isTransportInvalid({ error: 'AppError: 429 rate_limit_error' }, false)).toBe(true);
    expect(isTransportInvalid({ error: 'Overloaded (529)' }, false)).toBe(true);
    expect(isTransportInvalid({ error: 'ECONNRESET' }, false)).toBe(true);
  });

  it('a finished trial with no stoppedReason and no error is valid (not transport-invalid)', () => {
    expect(isTransportInvalid({}, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: undefined }, false)).toBe(false);
  });
});

describe('isDeadKeyError', () => {
  it('flags a billing / credit-exhaustion error (no retry can fix it → the sweep must abort)', () => {
    // The exact shape that silently turned a real Anthropic sweep into garbage the moment credits ran out.
    const billing =
      'AppError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';
    expect(isDeadKeyError({ error: billing })).toBe(true);
  });

  it('flags quota / auth exhaustion (401 / authentication / invalid api key)', () => {
    expect(isDeadKeyError({ error: 'insufficient_quota' })).toBe(true);
    expect(isDeadKeyError({ error: 'AppError: 401 authentication_error' })).toBe(true);
    expect(isDeadKeyError({ error: 'invalid api key' })).toBe(true);
  });

  it('does NOT flag a transport race, a transient error, CUT_OFF, or a normal run as dead-key', () => {
    expect(isDeadKeyError({ stoppedReason: 'navigation_timeout' })).toBe(false);
    expect(isDeadKeyError({ error: 'AppError: 429 rate_limit_error' })).toBe(false); // transient, retryable
    expect(isDeadKeyError({ error: CUT_OFF })).toBe(false);
    expect(isDeadKeyError({ stoppedReason: 'completed' })).toBe(false);
    expect(isDeadKeyError({})).toBe(false);
  });
});
