import { createHttpClient, type AxiosInstance } from '@tepegoz/http';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from '../types';
import { fromOpenAIResult, type OpenAICompletion } from './openai.provider';
import { contentToText } from '../content';

/**
 * Shared adapter (L7) for providers that expose an **OpenAI-compatible** Chat Completions REST endpoint
 * reached with a plain `Authorization: Bearer <key>` — DeepSeek, xAI (Grok), Groq. Same story as
 * {@link KimiProvider}/{@link NovaProvider} (also OpenAI-*compatible*, also `max_tokens` rather than
 * OpenAI's `max_completion_tokens`), factored into one base since there are now several: the RESPONSE
 * shape is identical to OpenAI so {@link fromOpenAIResult} is reused verbatim, and the only request
 * quirk — `max_tokens` — is handled by {@link toOpenAICompatParams}. Kimi/Nova predate this base and
 * keep their own copies; folding them in is a safe later cleanup.
 *
 * Not on the native tool path (`supportsNativeTools = false`): "OpenAI-compatible" is not OpenAI, the
 * compat surface is only partially verified per vendor, and the JSON-in-text path works on every model.
 * Timeout/cancellation/error → AppError mapping (redacted) live in the central client, so `complete()`
 * stays thin and the request mapping is a pure, unit-testable function.
 */

interface OACChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OACToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/** The Chat Completions request body these adapters send (`max_tokens`, like Kimi/Nova). */
export interface OpenAICompatChatRequest {
  model: string;
  max_tokens: number;
  messages: OACChatMessage[];
  tools?: OACToolDef[];
  response_format?: { type: 'json_object' };
}

/** Pure: canonical request → OpenAI-compatible Chat Completions request body. */
export function toOpenAICompatParams(req: CanonRequest): OpenAICompatChatRequest {
  const body: OpenAICompatChatRequest = {
    model: req.model,
    max_tokens: req.maxTokens,
    // `system` role is valid inline for the OpenAI-compatible API (unlike Anthropic) — no lifting.
    // Text-only path: block content is flattened, an image becomes an explicit marker, never dropped.
    messages: req.messages.map<OACChatMessage>((m) => ({
      role: m.role,
      content: contentToText(m.content),
    })),
  };
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map<OACToolDef>((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        // Opaque here; the capability plane is the authority on tool schemas.
        parameters: t.inputSchema,
      },
    }));
  }
  // json_object mode forces one valid JSON object (no prose/fences). The prompt already contains the
  // literal "JSON", which the OpenAI-compatible API requires when this mode is on.
  if (req.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

/**
 * One axios client per (baseURL, API key), reused across runs (internal-ai-rules: single singleton
 * client per provider — the client holds a keep-alive pool). An injected client (tests) bypasses it.
 */
const clientByKey = new Map<string, AxiosInstance>();
function sharedClient(baseURL: string, apiKey: string): AxiosInstance {
  const cacheKey = `${baseURL} ${apiKey}`;
  let client = clientByKey.get(cacheKey);
  if (client === undefined) {
    client = createHttpClient({ baseURL, headers: { Authorization: `Bearer ${apiKey}` } });
    clientByKey.set(cacheKey, client);
  }
  return client;
}

export interface OpenAICompatConfig {
  apiKey?: string;
  /** Inject a pre-configured axios instance (tests); otherwise one is built for the endpoint. */
  client?: AxiosInstance;
  /** Override the API root — a regional endpoint (see `PROVIDER_REGIONS`) or a gateway proxy.
   *  Defaults to the concrete provider's public API. `undefined` ⇒ that default. */
  baseURL?: string | undefined;
}

/** Base for the OpenAI-compatible REST providers; a subclass only names its `id` and default endpoint. */
abstract class OpenAICompatibleProvider implements ModelProvider {
  abstract readonly id: AIProvider;
  readonly supportsNativeTools = false;
  private readonly http: AxiosInstance;

  protected constructor(defaultBaseURL: string, config: OpenAICompatConfig) {
    this.http =
      config.client ?? sharedClient(config.baseURL ?? defaultBaseURL, config.apiKey ?? '');
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    // Errors (timeout/cancel/4xx/5xx) are normalized to AppError by the central client's interceptor.
    const res = await this.http.post<OpenAICompletion>(
      '/chat/completions',
      toOpenAICompatParams(req),
      { signal, timeout: req.timeoutMs },
    );
    return fromOpenAIResult(res.data);
  }
}

/** DeepSeek — `deepseek-chat` (V3) / `deepseek-reasoner` (R1). Single endpoint. */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id: AIProvider = 'deepseek';
  constructor(config: OpenAICompatConfig = {}) {
    super('https://api.deepseek.com/v1', config);
  }
}

/** xAI (Grok) — `grok-4` / `grok-3-mini`. Regional endpoints via `PROVIDER_REGIONS` → `config.baseURL`. */
export class XaiProvider extends OpenAICompatibleProvider {
  readonly id: AIProvider = 'xai';
  constructor(config: OpenAICompatConfig = {}) {
    super('https://api.x.ai/v1', config);
  }
}

/** Groq — open-weight models on Groq's LPU inference. Single endpoint. */
export class GroqProvider extends OpenAICompatibleProvider {
  readonly id: AIProvider = 'groq';
  constructor(config: OpenAICompatConfig = {}) {
    super('https://api.groq.com/openai/v1', config);
  }
}
