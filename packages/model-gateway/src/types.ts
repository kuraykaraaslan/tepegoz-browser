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
  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse>;
}
