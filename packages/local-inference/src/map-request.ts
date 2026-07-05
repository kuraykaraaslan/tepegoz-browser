import type { CanonMessage, CanonRequest } from '@tepegoz/model-gateway';
import { jsonObjectGrammar } from './json-grammar';

/**
 * Pure request mapping for the local provider. The turns pass straight through — the engine adapter
 * lifts the `system` turn into the llama chat session (analogous to the Anthropic adapter's
 * system-lift), so no restructuring is needed here.
 */
export function toLocalTurns(req: CanonRequest): readonly CanonMessage[] {
  return req.messages;
}

/** The GBNF grammar to enforce, or undefined when the caller did not demand JSON. */
export function grammarFor(req: CanonRequest): string | undefined {
  return req.responseFormat === 'json' ? jsonObjectGrammar() : undefined;
}
