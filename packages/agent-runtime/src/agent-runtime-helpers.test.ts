import { describe, expect, it, vi } from 'vitest';
import type { AgentFailure } from '@tepegoz/orchestrator';

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

describe('terminalMessageFor', () => {
  it('returns the agent summary verbatim when there is one', () => {
    expect(terminalMessageFor('completed', 'Booked the flight.', undefined)).toBe(
      'Booked the flight.',
    );
  });

  it('returns the Egress-Firewall failure message for a security stop (no summary)', () => {
    expect(
      terminalMessageFor(
        'egress_blocked',
        undefined,
        failure({ kind: 'egress_blocked', message: 'Outbound request looked like a secret.' }),
      ),
    ).toBe('Outbound request looked like a secret.');
  });

  it('maps a known stop reason to a plain-language sentence, not the raw enum code', () => {
    expect(terminalMessageFor('max_steps', undefined, undefined)).toMatch(/reached its step limit/);
    expect(terminalMessageFor('loop_detected', undefined, undefined)).toMatch(/repeating the same/);
    expect(terminalMessageFor('navigation_timeout', undefined, undefined)).toMatch(
      /never finished loading/,
    );
    // None of them leak the code itself.
    expect(terminalMessageFor('max_steps', undefined, undefined)).not.toContain('max_steps');
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
      ),
    ).toBe(
      'The run stopped after a tool call failed and could not be recovered. — tool=browser_update_page code=RATE_LIMITED slow down',
    );
  });

  it('in dev with a failure that carries no detail, still shows the plain-language reason', () => {
    expect(terminalMessageFor('max_steps', undefined, failure({ message: '' }))).toMatch(
      /reached its step limit/,
    );
  });

  it('falls back to the generic "Finished:" line for an unknown reason and no failure', () => {
    expect(terminalMessageFor('completed', undefined, undefined)).toBe('Finished: completed');
    expect(terminalMessageFor('completed', '', undefined)).toBe('Finished: completed');
    expect(terminalMessageFor('some_new_reason', undefined, undefined)).toBe(
      'Finished: some_new_reason',
    );
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
