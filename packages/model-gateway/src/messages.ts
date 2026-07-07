/**
 * Constant error messages for the gateway + providers (internal-ai-rules: messages live in a messages
 * file, never inline at throw sites). Dynamic values go through the typed factory.
 */
export const GatewayMessages = {
  MaxTokensRequired: 'max_tokens is required and must be a positive integer',
  TimeoutRequired: 'timeout is required and must be a positive integer',
  UnknownProviderError: 'Unknown model-provider error',
  RequestTimedOut: 'Model request aborted (timeout)',
  noProviderRegistered: (provider: string): string =>
    `No model provider registered for "${provider}"`,
  // Egress Firewall — messages carry only the redacted finding KINDS, never the payload/secret.
  egressBlocked: (kinds: string): string =>
    `Blocked: the outbound model request contains ${kinds} (potential secret exfiltration). The request was not sent.`,
  egressDenied: (kinds: string): string =>
    `Cancelled: you declined to send the outbound model request flagged for ${kinds} (potential secret exfiltration).`,
} as const;
