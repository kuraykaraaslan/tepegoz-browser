/**
 * Constant local-inference messages (internal-ai-rules: messages live in a messages file, not inline
 * at throw sites). These surface in the Agent Console the same way "No API key configured" does.
 */
export const LocalMessages = {
  NoModelSelected:
    'No local model selected. Download and select one in Settings → Providers → Local.',
  EngineUnavailable: 'On-device inference is unavailable on this machine.',
} as const;
