import type { CanonResponse } from '@tepegoz/model-gateway';
import type { GenerateResult } from './types';

/**
 * Pure: engine result → canonical response. `toolCalls` is always empty — the agent parses tool
 * choices from JSON text in the Reactor (grammar-constrained here), so the local provider is a
 * drop-in for the cloud providers and never uses native tool-calling.
 */
export function fromLocalResult(r: GenerateResult): CanonResponse {
  return {
    text: r.text,
    stopReason: r.finish === 'length' ? 'max_tokens' : r.finish === 'abort' ? 'error' : 'end',
    usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens },
    toolCalls: [],
  };
}
