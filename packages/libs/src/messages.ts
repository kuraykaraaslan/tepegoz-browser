/**
 * Constant, non-inline messages (internal-ai-rules: messages come from a messages file,
 * never inline strings in throw sites). These are operator/log-facing, NOT user-facing UI
 * (user-facing strings go through i18n).
 */
export const Messages = {
  NotFound: 'Resource not found',
  Unauthorized: 'Authentication required',
  Forbidden: 'Action blocked by policy',
  BadState: 'Invalid state for this operation',
  RateLimited: 'Rate limit exceeded',
  UpstreamDown: 'Upstream service unavailable',
  Timeout: 'Operation timed out',
} as const;

export type MessageKey = keyof typeof Messages;
