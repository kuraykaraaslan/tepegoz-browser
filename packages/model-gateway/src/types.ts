import type { AIProvider, CanonMessageContent } from '@tepegoz/shared-types';

/** Canonical, provider-agnostic request/response shapes (L7). Each provider adapter normalizes one
 *  vendor (Anthropic/OpenAI/Gemini) to these so the agent never sees vendor-specific formats. */

/**
 * One turn. `content` is `string | CanonContentBlock[]` (S1): a plain string stays the normalized
 * default so every existing caller compiles unchanged, while blocks carry images and native tool
 * use/results. The block schemas live in `@tepegoz/shared-types` (the single schema source) and are
 * re-exported below so a provider adapter has one import for the whole canonical surface.
 */
export interface CanonMessage {
  role: 'system' | 'user' | 'assistant';
  content: CanonMessageContent;
}

export type {
  CanonContentBlock,
  CanonImageBlock,
  CanonImageMediaType,
  CanonMessageContent,
  CanonTextBlock,
  CanonToolResultBlock,
  CanonToolUseBlock,
} from '@tepegoz/shared-types';
export {
  CanonContentBlockSchema,
  CanonImageBlockSchema,
  CanonMessageContentSchema,
  CanonTextBlockSchema,
  CanonToolResultBlockSchema,
  CanonToolUseBlockSchema,
} from '@tepegoz/shared-types';

export interface CanonToolDef {
  name: string;
  description: string;
  /** JSON Schema (opaque here; validated by the capability plane). */
  inputSchema: unknown;
}

export interface CanonToolCall {
  name: string;
  input: unknown;
  /**
   * The provider's correlation handle for this call, when it issued one natively. A follow-up
   * `tool_result` block must echo it back or the provider rejects the turn. Absent on the
   * JSON-in-text path, where there is no call to correlate with.
   */
  id?: string;
}

export type CanonStopReason = 'end' | 'max_tokens' | 'tool_use' | 'error';

export interface CanonUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CanonRequest {
  provider: AIProvider;
  model: string;
  /** Capability label for token budgeting, e.g. 'plan' | 'classify' | 'summarize'. */
  capability: string;
  messages: CanonMessage[];
  /** REQUIRED — no uncapped model call (internal-ai-rules). */
  maxTokens: number;
  /** REQUIRED — no untimed model call. */
  timeoutMs: number;
  tools?: CanonToolDef[];
  /**
   * How the provider should pick among `tools`. `auto` is the vendor default (the model may answer in
   * prose instead); `{ type: 'tool', name }` REQUIRES that one tool, which is what turns a native call
   * into a schema-enforced output shape rather than a suggestion. Ignored by adapters that do not
   * support native tools.
   */
  toolChoice?: { type: 'auto' } | { type: 'tool'; name: string };
  /**
   * Ask the provider to constrain output to a single JSON object (OpenAI `json_object` mode) — used by
   * the Planner/Reactor whose output is JSON-parsed + zod-validated, so weaker models can't wrap it in
   * prose/fences. Providers that follow JSON instructions natively (Anthropic) may ignore it.
   */
  responseFormat?: 'json';
}

export interface CanonResponse {
  text: string;
  stopReason: CanonStopReason;
  usage: CanonUsage;
  toolCalls: CanonToolCall[];
}

/** Provider adapter contract (provider pattern: base → concrete, selected by the gateway). */
export interface ModelProvider {
  readonly id: AIProvider;
  /**
   * This adapter maps `CanonRequest.tools` onto the vendor's **native** tool-calling API and normalizes
   * the response's tool calls into {@link CanonToolCall}. Absent or false ⇒ the JSON-in-text path, which
   * stays the proven default for the providers we do not put on native (kimi's partial OpenAI compat,
   * local GGUF via its JSON grammar).
   *
   * Optional rather than required so a one-off test double stays a three-line class; the flag is only
   * ever read through {@link ModelGateway.supportsNativeTools}, which treats absent as false.
   */
  readonly supportsNativeTools?: boolean;
  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse>;
  /**
   * Same contract as {@link complete} — one **settled** {@link CanonResponse} — while emitting output
   * fragments to `onDelta` as they arrive (S1 PR5). The return value is what every caller acts on; the
   * deltas are for showing a human that something is happening.
   *
   * Optional: an adapter without it still streams *correctly*, just not *early* — the gateway emits the
   * settled text as a single delta. That is a real degradation, honestly shaped, not simulated typing.
   */
  completeStream?(
    req: CanonRequest,
    signal: AbortSignal,
    onDelta: ModelDeltaSink,
  ): Promise<CanonResponse>;
}

/**
 * Receives output fragments as the model produces them. Fragments are UNSETTLED and UNVALIDATED: they
 * may be half a word, half a JSON object, or text the model goes on to revise. They may be shown; they
 * may never be parsed, journaled, or acted on (ADR-0025).
 */
export type ModelDeltaSink = (delta: string) => void;
