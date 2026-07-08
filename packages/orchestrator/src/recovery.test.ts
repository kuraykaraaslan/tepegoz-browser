import { describe, expect, it } from 'vitest';
import type { ToolError } from '@tepegoz/shared-types';
import {
  classifyRuntimeError,
  classifyToolFailure,
  recoveryAdviceFor,
  stopReasonForFailure,
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
});
