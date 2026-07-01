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
} as const;
