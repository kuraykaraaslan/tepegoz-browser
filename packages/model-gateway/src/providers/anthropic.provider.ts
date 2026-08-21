import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import type {
  CanonRequest,
  CanonResponse,
  CanonStopReason,
  CanonToolCall,
  CanonUsage,
  ModelDeltaSink,
  ModelProvider,
} from '../types';
import type { EffortLevel } from '../models';
import { GatewayMessages } from '../messages';
import { contentToText } from '../content';
import { contentChars, stableMessageIndex, ttlOf, worthCaching } from '../cache-plan';
import { toAnthropicContent } from './anthropic-content';

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
  content: ReadonlyArray<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Present only when prompt caching was in play; `null` on calls that did not use it. */
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
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
  // Canonical indices are NOT Anthropic indices: system turns are lifted out to the top-level `system`
  // field below, so every one of them shifts the mapping by one. Track the translation as we go rather
  // than reconstructing it afterwards — an off-by-one here puts the cache breakpoint on the WRONG turn,
  // which fails silently and expensively (see cache-plan.ts).
  const stableCanonIndex = stableMessageIndex(req.cache);
  let stableAnthropicIndex: number | null = null;
  let stablePrefixChars = 0;
  for (const [canonIndex, m] of req.messages.entries()) {
    const withinStablePrefix = stableCanonIndex !== null && canonIndex <= stableCanonIndex;
    if (withinStablePrefix) stablePrefixChars += contentChars(m.content);
    if (m.role === 'system') {
      systemParts.push(contentToText(m.content));
      continue;
    }
    // Native: blocks map onto Anthropic's own content blocks (S1 PR2), so a tool call is a real tool
    // call and an image is a real image — not JSON and a marker inside prose.
    messages.push({ role: m.role, content: toAnthropicContent(m.content) });
    if (withinStablePrefix) stableAnthropicIndex = messages.length - 1;
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
  if (req.toolChoice !== undefined && params.tools !== undefined) {
    params.tool_choice =
      req.toolChoice.type === 'tool'
        ? { type: 'tool', name: req.toolChoice.name }
        : { type: 'auto' };
  }
  if (opts.thinking === true) {
    params.thinking = { type: 'adaptive', display: 'summarized' };
  }
  if (opts.effort !== undefined) {
    params.output_config = { effort: opts.effort };
  }
  applyCacheBreakpoints(params, req, stableAnthropicIndex, stablePrefixChars);
  return params;
}

/**
 * Attach `cache_control` breakpoints for a {@link CanonCacheHint}.
 *
 * Two breakpoints at most (the API allows four). The first spans tools + system, which never change for
 * the life of a run; the second sits on the last turn the caller PROMISED it will not rewrite. Anything
 * after it is the volatile suffix — for the Reactor that is the current page state, which is fresh every
 * step and could never have been cached anyway.
 *
 * Each breakpoint is size-gated independently: a prefix below the vendor minimum does not cache, so
 * marking it buys nothing and only adds a way to be wrong.
 */
function applyCacheBreakpoints(
  params: Anthropic.MessageCreateParamsNonStreaming,
  req: CanonRequest,
  stableAnthropicIndex: number | null,
  stablePrefixChars: number,
): void {
  const hint = req.cache;
  if (hint === undefined) return;
  const ttl = ttlOf(hint);

  if (hint.systemAndTools === true && typeof params.system === 'string') {
    // Vendors render `tools` before `system`, so one breakpoint on the system block spans the pair —
    // but only the system text is ours to attach to, and only its own size is guaranteed present.
    const toolChars = (params.tools ?? []).reduce((n, t) => n + JSON.stringify(t).length, 0);
    if (worthCaching(params.system.length + toolChars)) {
      params.system = [
        { type: 'text', text: params.system, cache_control: { type: 'ephemeral', ttl } },
      ];
    }
  }

  if (stableAnthropicIndex === null || !worthCaching(stablePrefixChars)) return;
  const target = params.messages[stableAnthropicIndex];
  if (target === undefined) return;
  // `cache_control` rides on a content BLOCK, so a plain-string turn is widened to a one-block array.
  // Mapping to blocks changes no bytes the model sees; it only gives the marker somewhere to live.
  const blocks: Anthropic.ContentBlockParam[] =
    typeof target.content === 'string'
      ? [{ type: 'text', text: target.content }]
      : [...target.content];
  const last = blocks[blocks.length - 1];
  if (last === undefined || !acceptsCacheControl(last)) return;
  blocks[blocks.length - 1] = { ...last, cache_control: { type: 'ephemeral', ttl } };
  params.messages[stableAnthropicIndex] = { ...target, content: blocks };
}

/**
 * The block kinds `cache_control` may ride on. Not every content block accepts it — a `thinking` block
 * rejects it at the type level and at the API — so the marker is only ever attached to a kind that
 * carries it. These four are exactly what {@link toAnthropicContent} emits.
 */
type CacheableBlock = Extract<
  Anthropic.ContentBlockParam,
  { type: 'text' | 'image' | 'tool_use' | 'tool_result' }
>;
function acceptsCacheControl(block: Anthropic.ContentBlockParam): block is CacheableBlock {
  return (
    block.type === 'text' ||
    block.type === 'image' ||
    block.type === 'tool_use' ||
    block.type === 'tool_result'
  );
}

/** Pure: Anthropic completion → canonical response (text concat + tool calls + usage). */
export function fromAnthropicResult(result: AnthropicCompletion): CanonResponse {
  let text = '';
  const toolCalls: CanonToolCall[] = [];
  for (const block of result.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      // Carry the vendor id: the follow-up tool_result has to echo it back (see toAnthropicContent).
      const call: CanonToolCall = { name: block.name ?? '', input: block.input };
      if (block.id !== undefined) call.id = block.id;
      toolCalls.push(call);
    }
  }
  const usage: CanonUsage = {
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  };
  // Carried only when the vendor reported them. Absent stays absent: a zero here means "a cache was in
  // play and nothing hit", which the caller acts on, so it must never be manufactured from a null.
  const read = result.usage.cache_read_input_tokens;
  const written = result.usage.cache_creation_input_tokens;
  if (typeof read === 'number') usage.cacheReadTokens = read;
  if (typeof written === 'number') usage.cacheWriteTokens = written;
  return { text, stopReason: mapStopReason(result.stop_reason), usage, toolCalls };
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
  /** Anthropic's Messages API carries tools natively — this adapter maps both directions (S1 PR2). */
  readonly supportsNativeTools = true;
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
   * Streaming variant (S1 PR5). Returns the same settled {@link CanonResponse} `complete` does — the
   * caller's contract is unchanged — while forwarding fragments as the API produces them.
   *
   * Both fragment kinds are forwarded: `text` for prose turns, and `inputJson` for the native decision
   * arm, whose whole turn is a tool input and would otherwise stream nothing at all. Partial tool JSON is
   * not pretty, but a sink that shows a human that work is happening is the point; nothing parses it.
   */
  async completeStream(
    req: CanonRequest,
    signal: AbortSignal,
    onDelta: ModelDeltaSink,
  ): Promise<CanonResponse> {
    const params = toAnthropicParams(req, { effort: this.effort, thinking: this.thinking });
    let message: Anthropic.Message;
    try {
      const stream = this.client.messages.stream(params, { signal, timeout: req.timeoutMs });
      stream.on('text', (delta) => {
        onDelta(delta);
      });
      stream.on('inputJson', (partial) => {
        onDelta(partial);
      });
      message = await stream.finalMessage();
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
   * multi-step DAG totals are estimated from telemetry, not summed here
   * (docs/technical-ai-doc.md §5 — "Budgets, quotas & limits").
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
