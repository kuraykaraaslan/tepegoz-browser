import { describe, expect, it } from 'vitest';
import { AppError } from '@tepegoz/libs';
import type { ToolError } from '@tepegoz/shared-types';
import {
  classifyRuntimeError,
  classifyToolFailure,
  recoveryAdviceFor,
  stopReasonForFailure,
  type AgentFailureKind,
} from './recovery';

const err = (code: ToolError['code'], message: string, retryable: boolean): ToolError => ({
  isError: true,
  code,
  message,
  retryable,
});

describe('agent recovery classification', () => {
  it('classifies policy denial as non-retryable', () => {
    const failure = classifyToolFailure({
      tool: 'browser_update_page',
      error: err('FORBIDDEN', 'Denied at confirmation', false),
    });
    expect(failure.kind).toBe('policy_denied');
    expect(failure.retryable).toBe(false);
    expect(stopReasonForFailure(failure)).toBe('policy_denied');
  });

  it('classifies stale browser refs and recommends a fresh elements snapshot', () => {
    const failure = classifyToolFailure({
      tool: 'browser_update_page',
      error: err('INTERNAL_ERROR', 'stale ref: element not found in latest snapshot', true),
    });
    expect(failure.kind).toBe('selector_stale');
    expect(failure.retryable).toBe(true);
    expect(stopReasonForFailure(failure)).toBe('selector_stale');
    expect(recoveryAdviceFor(failure).nextTool).toBe('browser_get_elements');
  });

  it('classifies navigation timeouts and recommends page validation', () => {
    const failure = classifyToolFailure({
      tool: 'browser_update_location',
      error: err('TIMEOUT', 'navigation timed out while waiting for load', true),
    });
    expect(failure.kind).toBe('navigation_timeout');
    expect(recoveryAdviceFor(failure).nextTool).toBe('browser_validate_page');
  });

  it('classifies malformed model output from runtime errors', () => {
    const failure = classifyRuntimeError(new Error('Agent returned invalid JSON'));
    expect(failure.kind).toBe('model_malformed');
    expect(failure.retryable).toBe(true);
    expect(stopReasonForFailure(failure)).toBe('model_malformed');
  });

  it('classifies "No active page" as no_active_page and steers to navigate first', () => {
    // The ToolGateway flattens AppError(409) to INTERNAL_ERROR; the message survives and must win over
    // the generic transient catch-all so the model is told to open a page instead of retrying blindly.
    const failure = classifyToolFailure({
      tool: 'browser_get_page',
      error: err('INTERNAL_ERROR', 'No active page', true),
    });
    expect(failure.kind).toBe('no_active_page');
    expect(failure.retryable).toBe(true);
    expect(stopReasonForFailure(failure)).toBe('tool_error');
    const advice = recoveryAdviceFor(failure);
    expect(advice.nextTool).toBe('browser_update_location');
    expect(advice.instruction.toLowerCase()).toContain('open');
  });

  it('classifies a stale "No web tab" target as no_active_page too', () => {
    const failure = classifyToolFailure({
      tool: 'browser_get_elements',
      error: err('INTERNAL_ERROR', 'No web tab: tab-9', true),
    });
    expect(failure.kind).toBe('no_active_page');
  });

  it('does not treat a non-browser tool error mentioning "no active page" as no_active_page', () => {
    const failure = classifyToolFailure({
      tool: 'file_read_file',
      error: err('INTERNAL_ERROR', 'no active page', true),
    });
    expect(failure.kind).toBe('transient');
  });

  it('classifies a malformed-arguments VALIDATION_ERROR as boundedly retryable (fix the shape and retry)', () => {
    // Validation runs before any side effect in the ToolGateway, so a rejected call is safe to retry with
    // corrected args — a hard stop here killed whole runs when a (weaker) model got the shape wrong once.
    const failure = classifyToolFailure({
      tool: 'browser_update_page',
      error: err('VALIDATION_ERROR', 'Invalid arguments for browser_update_page', false),
    });
    expect(failure.kind).toBe('validation');
    expect(failure.retryable).toBe(true);
    // Still fails closed (bounded by the reactor's recovery counter) if the model never corrects it.
    expect(stopReasonForFailure(failure)).toBe('tool_error');
    expect(recoveryAdviceFor(failure).retryable).toBe(true);
    expect(recoveryAdviceFor(failure).instruction.toLowerCase()).toContain('schema');
  });
});

describe('classifyRuntimeError', () => {
  it('flags an Egress-Firewall 403 with the stable phrase as a non-retryable security stop', () => {
    const f = classifyRuntimeError(
      new AppError('The outbound model request was blocked', 403),
    );
    expect(f).toMatchObject({ kind: 'egress_blocked', retryable: false });
  });

  it('maps an AppError 502 to model_malformed (retryable)', () => {
    expect(classifyRuntimeError(new AppError('bad gateway', 502))).toMatchObject({
      kind: 'model_malformed',
      retryable: true,
    });
  });

  it('classifies by message when there is no status code', () => {
    expect(classifyRuntimeError(new Error('model returned invalid JSON')).kind).toBe(
      'model_malformed',
    );
    expect(classifyRuntimeError(new Error('please enter the verification code')).kind).toBe(
      'auth_handoff',
    );
    expect(classifyRuntimeError(new Error('navigation timed out')).kind).toBe('navigation_timeout');
    expect(classifyRuntimeError('a plain string with nothing to match')).toMatchObject({
      kind: 'unknown',
      retryable: false,
    });
    expect(classifyRuntimeError({ no: 'message' }).message).toBe('Unknown failure');
  });
});

describe('classifyToolFailure — the remaining branches', () => {
  it('auth handoff from the message alone', () => {
    expect(
      classifyToolFailure({ tool: 'browser_update_page', error: err('INTERNAL_ERROR', 'solve the captcha', false) }),
    ).toMatchObject({ kind: 'auth_handoff', retryable: false });
  });

  it('page_changed from a context-destroyed message', () => {
    expect(
      classifyToolFailure({ tool: 'agent_think', error: err('INTERNAL_ERROR', 'execution context was destroyed', false) }),
    ).toMatchObject({ kind: 'page_changed', retryable: true });
  });

  it('transient from a RATE_LIMITED / UPSTREAM_ERROR / retryable-flag error', () => {
    expect(classifyToolFailure({ tool: 't', error: err('RATE_LIMITED', 'slow down', false) }).kind).toBe(
      'transient',
    );
    expect(classifyToolFailure({ tool: 't', error: err('UPSTREAM_ERROR', 'x', false) }).kind).toBe(
      'transient',
    );
    expect(classifyToolFailure({ tool: 't', error: err('INTERNAL_ERROR', 'x', true) }).kind).toBe(
      'transient',
    );
  });

  it('unknown for an unrecognised, non-retryable error', () => {
    expect(
      classifyToolFailure({ tool: 't', error: err('NOT_FOUND', 'weird', false) }),
    ).toMatchObject({ kind: 'unknown', retryable: false });
  });

  it('tolerates an error object with no code / no retryable flag', () => {
    const f = classifyToolFailure({ tool: 't', error: { message: 'bare' } as never });
    expect(f).toMatchObject({ kind: 'unknown', code: undefined, message: 'bare' });
  });
});

const ALL_KINDS: AgentFailureKind[] = [
  'transient',
  'policy_denied',
  'page_changed',
  'selector_stale',
  'navigation_timeout',
  'auth_handoff',
  'model_malformed',
  'validation',
  'egress_blocked',
  'no_active_page',
  'unknown',
];

describe('stopReasonForFailure + recoveryAdviceFor cover every AgentFailureKind', () => {
  it.each(ALL_KINDS)('%s → a stop reason and an advice string', (kind) => {
    const failure = { kind, message: 'm' } as Parameters<typeof stopReasonForFailure>[0];
    expect(typeof stopReasonForFailure(failure)).toBe('string');
    const advice = recoveryAdviceFor(failure);
    expect(advice.instruction.length).toBeGreaterThan(10);
    expect(typeof advice.retryable).toBe('boolean');
  });

  it('maps the distinctive stop reasons', () => {
    const sr = (kind: AgentFailureKind) =>
      stopReasonForFailure({ kind, message: 'm' } as Parameters<typeof stopReasonForFailure>[0]);
    expect(sr('navigation_timeout')).toBe('navigation_timeout');
    expect(sr('page_changed')).toBe('page_changed');
    expect(sr('auth_handoff')).toBe('handoff');
    expect(sr('transient')).toBe('transient_error');
    expect(sr('egress_blocked')).toBe('egress_blocked');
    expect(sr('no_active_page')).toBe('tool_error');
  });
});
