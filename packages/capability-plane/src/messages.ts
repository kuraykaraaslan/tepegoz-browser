/**
 * Constant error messages for the capability plane (internal-ai-rules: messages live in a messages
 * file, never inline at throw sites). Dynamic values go through the typed factory.
 */
export const CapabilityMessages = {
  toolAlreadyRegistered: (id: string): string => `Tool already registered: ${id}`,
} as const;
