/**
 * Constant HTTP-client messages (internal-ai-rules: messages live in a messages file, never inline at
 * throw sites). Provider-specific error text is taken from the response body when present.
 */
export const HttpMessages = {
  RequestTimedOut: 'HTTP request timed out',
  RequestCanceled: 'HTTP request canceled',
  UnknownHttpError: 'Unknown HTTP client error',
} as const;
