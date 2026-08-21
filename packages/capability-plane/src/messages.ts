/**
 * Constant error messages for the capability plane (internal-ai-rules: messages live in a messages
 * file, never inline at throw sites). Dynamic values go through the typed factory.
 */
export const CapabilityMessages = {
  toolAlreadyRegistered: (id: string): string => `Tool already registered: ${id}`,
  toolNeedsValidator: (id: string): string =>
    `Tool ${id} registered without an input validator — every tool argument is LLM-produced and must be validated before execution`,
  toolNeedsHandler: (id: string): string => `Tool ${id} registered without a handler`,
  toolValidatorTooPermissive: (id: string): string =>
    `Tool ${id} registered with a validator that accepts anything (it said yes to a function value) — that is not validation`,
} as const;
