import { AppError } from '@tepegoz/libs';
import type { ToolErrorCode } from '@tepegoz/shared-types';
import type { StopReason, StepOutcome } from './executor';

export type AgentFailureKind =
  | 'transient'
  | 'policy_denied'
  | 'page_changed'
  | 'selector_stale'
  | 'navigation_timeout'
  | 'auth_handoff'
  | 'model_malformed'
  | 'validation'
  | 'egress_blocked'
  | 'unknown';

export interface AgentFailure {
  kind: AgentFailureKind;
  message: string;
  retryable: boolean;
  tool?: string | undefined;
  code?: ToolErrorCode | undefined;
}

export interface RecoveryAdvice {
  retryable: boolean;
  instruction: string;
  nextTool?: string | undefined;
}

// The Egress Firewall's block/deny messages (model-gateway messages.ts) both carry this stable phrase.
const EGRESS_BLOCK_RE = /outbound model request/i;
const MODEL_MALFORMED_RE = /invalid json|malformed (?:decision|plan)|returned invalid|returned a malformed/i;
const AUTH_HANDOFF_RE = /captcha|2fa|two[-\s]?factor|otp|one[-\s]?time|verification code/i;
const STALE_SELECTOR_RE = /stale|detached|no such element|element .*not found|ref\b|snapshot|not visible/i;
const NAVIGATION_TIMEOUT_RE = /timeout|timed out|navigation|load|net::|did-stop-loading/i;
const PAGE_CHANGED_RE = /page changed|frame detached|execution context|context destroyed|navigated|target closed/i;

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return typeof error === 'string' ? error : 'Unknown failure';
}

function codeOf(error: unknown): ToolErrorCode | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code as ToolErrorCode;
  }
  return undefined;
}

function retryableOf(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    (error as { retryable?: unknown }).retryable === true
  );
}

export function classifyRuntimeError(err: unknown): AgentFailure {
  const message = messageOf(err);
  // Egress Firewall block/deny (AppError 403 with the stable egress phrase) — a security stop, not a
  // generic tool error; surfaced distinctly so the user learns why the run stopped. Not retryable.
  if (err instanceof AppError && err.statusCode === 403 && EGRESS_BLOCK_RE.test(message)) {
    return { kind: 'egress_blocked', message, retryable: false };
  }
  if (err instanceof AppError && err.statusCode === 502) {
    return { kind: 'model_malformed', message, retryable: true };
  }
  if (MODEL_MALFORMED_RE.test(message)) {
    return { kind: 'model_malformed', message, retryable: true };
  }
  if (AUTH_HANDOFF_RE.test(message)) {
    return { kind: 'auth_handoff', message, retryable: false };
  }
  if (NAVIGATION_TIMEOUT_RE.test(message)) {
    return { kind: 'navigation_timeout', message, retryable: true };
  }
  return { kind: 'unknown', message, retryable: false };
}

export function classifyToolFailure(outcome: Pick<StepOutcome, 'tool' | 'error'>): AgentFailure {
  const error = outcome.error;
  const message = messageOf(error);
  const code = codeOf(error);
  const base = { tool: outcome.tool, code, message };

  if (code === 'FORBIDDEN') {
    return { ...base, kind: 'policy_denied', retryable: false };
  }
  if (AUTH_HANDOFF_RE.test(message)) {
    return { ...base, kind: 'auth_handoff', retryable: false };
  }
  if (code === 'TIMEOUT' || NAVIGATION_TIMEOUT_RE.test(message)) {
    return { ...base, kind: 'navigation_timeout', retryable: true };
  }
  if (outcome.tool.startsWith('browser_') && STALE_SELECTOR_RE.test(message)) {
    return { ...base, kind: 'selector_stale', retryable: true };
  }
  if (PAGE_CHANGED_RE.test(message)) {
    return { ...base, kind: 'page_changed', retryable: true };
  }
  if (code === 'VALIDATION_ERROR') {
    return { ...base, kind: 'validation', retryable: false };
  }
  if (retryableOf(error) || code === 'RATE_LIMITED' || code === 'UPSTREAM_ERROR' || code === 'INTERNAL_ERROR') {
    return { ...base, kind: 'transient', retryable: true };
  }
  return { ...base, kind: 'unknown', retryable: false };
}

export function stopReasonForFailure(failure: AgentFailure): StopReason {
  switch (failure.kind) {
    case 'policy_denied':
      return 'policy_denied';
    case 'navigation_timeout':
      return 'navigation_timeout';
    case 'selector_stale':
      return 'selector_stale';
    case 'page_changed':
      return 'page_changed';
    case 'auth_handoff':
      return 'handoff';
    case 'model_malformed':
      return 'model_malformed';
    case 'transient':
      return 'transient_error';
    case 'egress_blocked':
      return 'egress_blocked';
    case 'validation':
    case 'unknown':
      return 'tool_error';
  }
}

export function recoveryAdviceFor(failure: AgentFailure): RecoveryAdvice {
  switch (failure.kind) {
    case 'selector_stale':
      return {
        retryable: true,
        nextTool: 'browser_get_elements',
        instruction:
          'The element reference is stale. Re-read the current tab with browser_get_elements, then retry with a fresh ref. If the actionable target is not exposed by a11y/text, use browser_get_screenshot as a visual fallback.',
      };
    case 'navigation_timeout':
      return {
        retryable: true,
        nextTool: 'browser_validate_page',
        instruction:
          'The navigation or load wait timed out. Validate the page state with browser_validate_page, then continue from the current URL.',
      };
    case 'page_changed':
      return {
        retryable: true,
        nextTool: 'browser_get_elements',
        instruction:
          'The page changed while acting. Re-read the page and elements before choosing the next action; use browser_get_screenshot if the new state is not visible in text/a11y.',
      };
    case 'model_malformed':
      return {
        retryable: true,
        instruction:
          'The previous model response was malformed. Retry once with strict JSON matching the required decision schema.',
      };
    case 'transient':
      return {
        retryable: true,
        instruction:
          'This looks transient. Retry only after re-reading or validating the current state; do not repeat the same side effect blindly.',
      };
    case 'policy_denied':
      return {
        retryable: false,
        instruction: 'Policy or user approval denied this action. Stop or ask the user for a safer alternative.',
      };
    case 'auth_handoff':
      return {
        retryable: false,
        instruction: 'Authentication or CAPTCHA needs human handoff. Do not try to solve it automatically.',
      };
    case 'egress_blocked':
      return {
        retryable: false,
        instruction:
          'The Egress Firewall stopped this run because the outbound model request looked like it contained a secret, and it was not sent. Remove the sensitive value from context or narrow the task, then start again.',
      };
    case 'validation':
    case 'unknown':
      return {
        retryable: false,
        instruction: 'The failure is not safely recoverable without a new user decision.',
      };
  }
}
