import { createHttpClient, type AxiosInstance } from '@tepegoz/http';
import type { AIProvider } from '@tepegoz/shared-types';
import type {
  CanonRequest,
  CanonResponse,
  CanonStopReason,
  CanonToolCall,
  ModelProvider,
} from '../types';

/**
 * OpenAI (GPT) adapter (L7) — talks to the Chat Completions REST endpoint directly over the central
 * axios seam ({@link createHttpClient}); NO vendor SDK. Notes vs. the Anthropic adapter:
 *  - `max_completion_tokens` is the required cap (`max_tokens` is deprecated); enforced by the gateway.
 *  - the `system` role is a normal message here (no top-level lift like Anthropic).
 *  - tool-call arguments arrive as a JSON *string* and are parsed to `input` at this boundary.
 *  - the tier models are plain chat models (gpt-4o family), so NO `reasoning_effort` is sent — that
 *    field only applies to o-series reasoning models and would 400 here. Effort stays a routing/telemetry
 *    concern (docs/ROADMAP §5.6); wiring reasoning models is a later slice.
 *
 * Timeout, cancellation, and error → AppError mapping (redacted) all live in the central client, so
 * `complete()` is thin. The request/response mapping is exposed as pure functions so it can be
 * unit-tested without a network call or an API key.
 */

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/** The Chat Completions request body this adapter sends. */
export interface OpenAIChatRequest {
  model: string;
  max_completion_tokens: number;
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolDef[];
  response_format?: { type: 'json_object' };
}

/** The subset of a Chat Completions response this adapter consumes. */
export interface OpenAICompletion {
  choices: ReadonlyArray<{
    message: {
      content: string | null;
      tool_calls?: ReadonlyArray<{ type: string; function?: { name: string; arguments: string } }>;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

interface ProviderConfig {
  apiKey?: string;
  /** Inject a pre-configured axios instance (tests); otherwise one is built for the OpenAI API. */
  client?: AxiosInstance;
  /** Override the API root (self-hosted / gateway proxies). Defaults to the public OpenAI API. */
  baseURL?: string;
}

function mapFinishReason(reason: string | null): CanonStopReason {
  switch (reason) {
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'error';
    // 'stop' | null → a normal stop for the canon contract.
    default:
      return 'end';
  }
}

/** Tool-call arguments come back as a JSON string; parse to an object. On malformed JSON keep the raw
 *  string so nothing is silently dropped — the capability plane's zod safeParse rejects it cleanly. */
function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Pure: canonical request → OpenAI Chat Completions request body. */
export function toOpenAIParams(req: CanonRequest): OpenAIChatRequest {
  const body: OpenAIChatRequest = {
    model: req.model,
    max_completion_tokens: req.maxTokens,
    // The `system` role is valid inline for OpenAI (unlike Anthropic), so no lifting is needed.
    messages: req.messages.map<OpenAIChatMessage>((m) => ({ role: m.role, content: m.content })),
  };
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map<OpenAIToolDef>((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        // Opaque here; the capability plane is the authority on tool schemas.
        parameters: t.inputSchema,
      },
    }));
  }
  // json_object mode forces a single valid JSON object (no prose/fences). The prompt already contains
  // the literal "JSON", which OpenAI requires when this mode is on.
  if (req.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

/** Pure: OpenAI completion → canonical response (first choice's text + tool calls + usage). */
export function fromOpenAIResult(result: OpenAICompletion): CanonResponse {
  const choice = result.choices[0];
  const toolCalls: CanonToolCall[] = [];
  for (const tc of choice?.message.tool_calls ?? []) {
    // Only function tool calls carry a `function` payload (custom tool calls are skipped).
    if (tc.function !== undefined) {
      toolCalls.push({ name: tc.function.name, input: parseToolArgs(tc.function.arguments) });
    }
  }
  return {
    text: choice?.message.content ?? '',
    stopReason: mapFinishReason(choice?.finish_reason ?? null),
    usage: {
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
    },
    toolCalls,
  };
}

export class OpenAIProvider implements ModelProvider {
  readonly id: AIProvider = 'openai';
  private readonly http: AxiosInstance;

  constructor(config: ProviderConfig) {
    this.http =
      config.client ??
      createHttpClient({
        baseURL: config.baseURL ?? OPENAI_BASE_URL,
        headers: { Authorization: `Bearer ${config.apiKey ?? ''}` },
      });
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    // Errors (timeout/cancel/4xx/5xx) are normalized to AppError by the central client's interceptor.
    const res = await this.http.post<OpenAICompletion>('/chat/completions', toOpenAIParams(req), {
      signal,
      timeout: req.timeoutMs,
    });
    return fromOpenAIResult(res.data);
  }
}
