import { describe, expect, it } from 'vitest';
import { CUT_OFF, isTransportInvalid } from './harness-run';

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

  it('a finished trial with no stoppedReason and no error is valid (not transport-invalid)', () => {
    expect(isTransportInvalid({}, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: undefined }, false)).toBe(false);
  });
});
