import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, CanonStopReason, CanonToolCall, ModelProvider } from '../types';
import type { EffortLevel } from '../models';
import { GatewayMessages } from '../messages';

/**
 * Anthropic (Claude) adapter (L7) — normalizes the canonical request/response shapes to the
 * Anthropic Messages API and back. Verified against the `claude-api` reference:
 *  - `max_tokens` is always required (enforced by the gateway before we are called).
 *  - reasoning depth is set via `output_config.effort`; `budget_tokens` is NEVER sent (400 on Opus 4.8).
 *  - adaptive thinking only (`thinking: { type: 'adaptive' }`), opt-in via constructor options.
 *  - the abort signal + timeout (ms) are passed straight through to the SDK request options.
 *
 * The request/response mapping is exposed as pure functions so it can be unit-tested without a
 * network call or an API key; `complete()` is the thin glue that the gateway drives.
 */

interface ProviderConfig {
  apiKey?: string;
  /** Inject a pre-built (or fake) client; otherwise one is constructed from `apiKey`. */
  client?: Anthropic;
  /** Default reasoning effort for this provider instance (omit → server default `high`). */
  effort?: EffortLevel | undefined;
  /** Enable adaptive thinking (summarized). Default: off (keeps token spend predictable). */
  thinking?: boolean;
}

/** The subset of an Anthropic `Message` this adapter consumes. The real SDK `Message` is a
 *  structural supertype, so it is accepted directly by {@link fromAnthropicResult}. */
export interface AnthropicCompletion {
  content: ReadonlyArray<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

function mapStopReason(reason: string | null): CanonStopReason {
  switch (reason) {
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    case 'refusal':
      return 'error';
    // 'end_turn' | 'stop_sequence' | 'pause_turn' | null → a normal stop for the canon contract.
    default:
      return 'end';
  }
}

/** Pure: canonical request → Anthropic Messages params. System messages are lifted to the
 *  top-level `system` field (the API does not take a system role inside `messages`). */
export function toAnthropicParams(
  req: CanonRequest,
  opts: { effort?: EffortLevel | undefined; thinking?: boolean } = {},
): Anthropic.MessageCreateParamsNonStreaming {
  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    messages.push({ role: m.role, content: m.content });
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens,
    messages,
  };

  if (systemParts.length > 0) {
    params.system = systemParts.join('\n\n');
  }
  if (req.tools !== undefined && req.tools.length > 0) {
    params.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      // Opaque here; the capability plane is the authority on tool schemas.
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }
  if (opts.thinking === true) {
    params.thinking = { type: 'adaptive', display: 'summarized' };
  }
  if (opts.effort !== undefined) {
    params.output_config = { effort: opts.effort };
  }
  return params;
}

/** Pure: Anthropic completion → canonical response (text concat + tool calls + usage). */
export function fromAnthropicResult(result: AnthropicCompletion): CanonResponse {
  let text = '';
  const toolCalls: CanonToolCall[] = [];
  for (const block of result.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({ name: block.name ?? '', input: block.input });
    }
  }
  return {
    text,
    stopReason: mapStopReason(result.stop_reason),
    usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
    toolCalls,
  };
}

/**
 * One Anthropic SDK client per API key, reused across runs (internal-ai-rules: single singleton client
 * per provider — the SDK holds a keep-alive connection pool, so re-creating it every run wastes sockets).
 * Keyed by the raw key, which stays in the main process. An injected client (tests) bypasses the cache.
 */
const clientByKey = new Map<string, Anthropic>();
function sharedClient(apiKey: string | undefined): Anthropic {
  const cacheKey = apiKey ?? '';
  let client = clientByKey.get(cacheKey);
  if (client === undefined) {
    client = new Anthropic(apiKey !== undefined ? { apiKey } : {});
    clientByKey.set(cacheKey, client);
  }
  return client;
}

function toAppError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    const status: unknown = err.status;
    // 4xx = our fault (request/auth/policy); anything else = upstream down → 503.
    const code = typeof status === 'number' && status >= 400 && status < 500 ? status : 503;
    return new AppError(err.message, code);
  }
  return err instanceof Error ? err : new AppError(GatewayMessages.UnknownProviderError, 503);
}

export class AnthropicProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  private readonly client: Anthropic;
  private readonly effort: EffortLevel | undefined;
  private readonly thinking: boolean;

  constructor(config: ProviderConfig) {
    this.client = config.client ?? sharedClient(config.apiKey);
    this.effort = config.effort;
    this.thinking = config.thinking ?? false;
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    const params = toAnthropicParams(req, { effort: this.effort, thinking: this.thinking });
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create(params, { signal, timeout: req.timeoutMs });
    } catch (err) {
      if (signal.aborted) {
        throw new AppError(GatewayMessages.RequestTimedOut, 503);
      }
      throw toAppError(err);
    }
    return fromAnthropicResult(message);
  }

  /**
   * Count input tokens for a single prompt (`count_tokens`). Note: this only sizes ONE request —
   * multi-step DAG totals are estimated from telemetry, not summed here (docs/ROADMAP §5.6).
   */
  async countInputTokens(req: CanonRequest): Promise<number> {
    const params = toAnthropicParams(req);
    const countParams: Anthropic.MessageCountTokensParams = {
      model: params.model,
      messages: params.messages,
    };
    if (params.system !== undefined) {
      countParams.system = params.system;
    }
    if (params.tools !== undefined) {
      countParams.tools = params.tools;
    }
    const res = await this.client.messages.countTokens(countParams);
    return res.input_tokens;
  }
}
