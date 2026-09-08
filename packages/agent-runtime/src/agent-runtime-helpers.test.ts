import { describe, expect, it, vi } from 'vitest';
import type { AgentFailure } from '@tepegoz/orchestrator';
import type { StopReasonStrings } from './agent-runtime-helpers';

// Force the dev branch of terminalMessageFor on (CI runs with NODE_ENV != 'development', so isDev is
// false by default).
vi.mock('@tepegoz/libs', () => ({ isDev: true }));

const planner = vi.hoisted(() => ({ plan: vi.fn() }));
const classifyRuntimeError = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/orchestrator', () => ({ Planner: planner, classifyRuntimeError }));

const { terminalMessageFor, planOrEgressStop } = await import('./agent-runtime-helpers');

const failure = (over: Partial<AgentFailure> = {}): AgentFailure => ({
  kind: 'unknown',
  message: '',
  retryable: false,
  ...over,
});

/** A stand-in dictionary — the host injects the real localized copy. */
const S: StopReasonStrings = {
  maxSteps: 'The run reached its step limit before finishing.',
  loopDetected: 'The run was repeating the same action without progress.',
  toolError: 'The run stopped after a tool call failed and could not be recovered.',
  policyDenied: 'An action it needed was not permitted.',
  selectorStale: 'The run lost track of an element on the page.',
  navigationTimeout: 'The run stopped waiting for a page that never finished loading.',
  pageChanged: 'The page changed unexpectedly mid-action.',
  modelMalformed: 'The model returned a response it could not act on.',
  transientError: 'A temporary error it could not get past.',
  generic: 'The run stopped for an unexpected reason.',
};

describe('terminalMessageFor', () => {
  it('returns the agent summary verbatim when there is one', () => {
    expect(terminalMessageFor('completed', 'Booked the flight.', undefined, S)).toBe(
      'Booked the flight.',
    );
  });

  it('returns the Egress-Firewall failure message for a security stop (no summary)', () => {
    expect(
      terminalMessageFor(
        'egress_blocked',
        undefined,
        failure({ kind: 'egress_blocked', message: 'Outbound request looked like a secret.' }),
        S,
      ),
    ).toBe('Outbound request looked like a secret.');
  });

  it('maps a known stop reason to its localized sentence, not the raw enum code', () => {
    expect(terminalMessageFor('max_steps', undefined, undefined, S)).toBe(S.maxSteps);
    expect(terminalMessageFor('loop_detected', undefined, undefined, S)).toBe(S.loopDetected);
    expect(terminalMessageFor('navigation_timeout', undefined, undefined, S)).toBe(
      S.navigationTimeout,
    );
    // None of them leak the code itself.
    expect(terminalMessageFor('max_steps', undefined, undefined, S)).not.toContain('max_steps');
  });

  it('in dev, appends the failure detail after the plain-language reason', () => {
    expect(
      terminalMessageFor(
        'tool_error',
        undefined,
        failure({
          kind: 'transient',
          tool: 'browser_update_page',
          code: 'RATE_LIMITED',
          message: 'slow down',
        }),
        S,
      ),
    ).toBe(`${S.toolError} — tool=browser_update_page code=RATE_LIMITED slow down`);
  });

  it('in dev with a failure that carries no detail, still shows the plain-language reason', () => {
    expect(terminalMessageFor('max_steps', undefined, failure({ message: '' }), S)).toBe(S.maxSteps);
  });

  it('falls back to the generic line for a reason not in the map, and never shows the raw code', () => {
    expect(terminalMessageFor('completed', undefined, undefined, S)).toBe(S.generic);
    expect(terminalMessageFor('completed', '', undefined, S)).toBe(S.generic);
    const out = terminalMessageFor('some_new_reason', undefined, undefined, S);
    expect(out).toBe(S.generic);
    expect(out).not.toContain('some_new_reason');
  });
});

describe('planOrEgressStop', () => {
  it('returns the plan on success', async () => {
    const plan = { steps: [] };
    planner.plan.mockResolvedValueOnce(plan);
    await expect(planOrEgressStop({} as never)).resolves.toEqual({ plan });
  });

  it('converts an Egress-Firewall block during planning into a terminal egressFailure', async () => {
    planner.plan.mockRejectedValueOnce(new Error('blocked'));
    classifyRuntimeError.mockReturnValueOnce({
      kind: 'egress_blocked',
      message: 'secret in the prompt',
      retryable: false,
    });
    await expect(planOrEgressStop({} as never)).resolves.toEqual({
      egressFailure: { kind: 'egress_blocked', message: 'secret in the prompt', retryable: false },
    });
  });

  it('re-throws any other planning error unchanged', async () => {
    const err = new Error('planner timeout');
    planner.plan.mockRejectedValueOnce(err);
    classifyRuntimeError.mockReturnValueOnce({ kind: 'unknown', message: '', retryable: false });
    await expect(planOrEgressStop({} as never)).rejects.toBe(err);
  });
});
