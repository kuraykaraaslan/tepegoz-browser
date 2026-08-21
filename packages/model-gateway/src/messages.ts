/**
 * Constant error messages for the gateway + providers (internal-ai-rules: messages live in a messages
 * file, never inline at throw sites). Dynamic values go through the typed factory.
 */
export const GatewayMessages = {
  MaxTokensRequired: 'max_tokens is required and must be a positive integer',
  TimeoutRequired: 'timeout is required and must be a positive integer',
  UnknownProviderError: 'Unknown model-provider error',
  RequestTimedOut: 'Model request aborted (timeout)',
  RunTokenCeilingReached: 'This run has reached its token ceiling; no further model requests were sent',
  noProviderRegistered: (provider: string): string =>
    `No model provider registered for "${provider}"`,
  /** Message names the offending role + the first zod issue — never the content itself, which can
   *  hold page text or a secret the caller was about to have inspected. */
  invalidContent: (role: string, issue: string): string =>
    `Malformed message content on the "${role}" turn: ${issue}`,
  // Egress Firewall — messages carry only the redacted finding KINDS, never the payload/secret.
  egressBlocked: (kinds: string): string =>
    `Blocked: the outbound model request contains ${kinds} (potential secret exfiltration). The request was not sent.`,
  egressDenied: (kinds: string): string =>
    `Cancelled: you declined to send the outbound model request flagged for ${kinds} (potential secret exfiltration).`,
} as const;
