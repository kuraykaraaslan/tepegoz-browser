import { ModelGateway, type CanonMessage } from '@tepegoz/model-gateway';
import { parseDecision, parseNativeDecision, type Decision } from './reactor-decision';
import { DECISION_TOOL_NAME, decisionToolDef, type DecisionMode } from './reactor-decision-mode';
import type { ReactOptions, ReactRequest } from './reactor-types';

/** Per-step inputs to one model decision (everything run-constant is resolved once by the caller). */
export interface DecisionRequest {
  req: ReactRequest;
  options: ReactOptions;
  messages: CanonMessage[];
  decisionMode: DecisionMode;
  quickMode: boolean;
  /** The conversation window's prompt-cache breakpoint at this step. */
  cacheStableIndex: number | null;
}

/**
 * Ask the model for the NEXT decision and settle it through the zod boundary. Throws on a transport or
 * parse failure — the loop classifies it (`classifyRuntimeError`) and decides whether to repair or stop.
 * `responseText` is what goes back into the assistant history.
 */
export async function requestDecision(
  d: DecisionRequest,
): Promise<{ decision: Decision; responseText: string }> {
  const { req, options, messages, decisionMode, quickMode, cacheStableIndex } = d;
  const request = {
    provider: req.provider,
    model: req.model,
    capability: 'exec',
    messages,
    maxTokens: req.maxTokens ?? 1500,
    timeoutMs: req.timeoutMs ?? 60_000,
    // The stable-prefix promise (see `ConversationWindow.cacheStableIndex`). `1h` because a sweep runs many tasks
    // back to back against the same system prompt and tool set — the 5-minute default would
    // expire the shared half between trials and re-pay for it every time.
    cache: {
      systemAndTools: true,
      ...(cacheStableIndex !== null && { lastStableMessageIndex: cacheStableIndex }),
      ttl: '1h' as const,
    },
    // Native: one required tool whose schema IS the decision, so the provider enforces the shape.
    // JSON: the legacy json_object nudge, which only guarantees valid JSON, never valid shape.
    ...(decisionMode === 'native'
      ? {
          tools: [decisionToolDef()],
          toolChoice: { type: 'tool' as const, name: DECISION_TOOL_NAME },
        }
      : { responseFormat: 'json' as const }),
  };
  // Streaming changes only WHO SEES the output early — the settled response below is still the
  // only thing parsed, and the sink is never read back by the loop (ADR-0025). Gated to the
  // native arm only: native's text is empty except on a genuine "finish" turn (S1 PR4's own
  // comment above — "usually pure tool call with empty text"), so streaming it is harmless. The
  // JSON arm's entire text IS the decision — action, tool id, args, rationale, the working-state
  // ledger — for every provider without native tool support (Kimi, Nova, DeepSeek, xAI, Groq via
  // openai-compat), so streaming it would show raw decision JSON growing character by character in
  // the "working" indicator on every tool-calling step. That is exactly the "streaming text while
  // buffering tool calls" failure the interactive-streaming DoD (S1 PR5b / S8 PR9) named as the
  // case that breaks — it just breaks per-provider (native vs JSON transport) rather than per-run
  // -kind (Ask vs Act/Dev), since only one run kind exists today (see phase docs).
  const onDelta = decisionMode === 'native' ? options.onModelDelta : undefined;
  const response =
    onDelta === undefined
      ? await ModelGateway.complete(request)
      : await ModelGateway.generateStream(request, onDelta);
  const decision =
    decisionMode === 'native'
      ? parseNativeDecision(response)
      : parseDecision(response.text, quickMode);
  // The native arm's turn is usually pure tool call with empty text; re-serializing the settled
  // decision keeps the assistant history non-empty and structurally identical across both arms.
  const responseText = response.text.trim().length > 0 ? response.text : JSON.stringify(decision);
  return { decision, responseText };
}
