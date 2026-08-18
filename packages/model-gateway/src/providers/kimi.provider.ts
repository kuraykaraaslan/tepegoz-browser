import { createHttpClient, type AxiosInstance } from '@tepegoz/http';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from '../types';
import { fromOpenAIResult, type OpenAICompletion } from './openai.provider';
import { contentToText } from '../content';

/**
 * Kimi (Moonshot AI) adapter (L7) — talks to Moonshot's OpenAI-compatible Chat Completions REST
 * endpoint over the central axios seam ({@link createHttpClient}); NO vendor SDK. The RESPONSE shape is
 * identical to OpenAI, so {@link fromOpenAIResult} is reused verbatim. The REQUEST differs in one field:
 * Moonshot documents `max_tokens` (not OpenAI's `max_completion_tokens`), so the request builder here
 * emits `max_tokens`. A distinct `id: 'kimi'` (vs. reusing {@link OpenAIProvider}, whose id is fixed to
 * 'openai') is required so the ModelGateway registry dispatches Kimi runs correctly.
 *
 * Like the other REST adapters, timeout/cancellation/error → AppError mapping (redacted) live in the
 * central client, so `complete()` is thin, and the request mapping is a pure function so it can be
 * unit-tested without a network call or an API key.
 */

const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';

interface KimiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface KimiToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/** The Chat Completions request body this adapter sends (Moonshot expects `max_tokens`). */
export interface KimiChatRequest {
  model: string;
  max_tokens: number;
  messages: KimiChatMessage[];
  tools?: KimiToolDef[];
  response_format?: { type: 'json_object' };
}

/** Pure: canonical request → Kimi (Moonshot) Chat Completions request body. */
export function toKimiParams(req: CanonRequest): KimiChatRequest {
  const body: KimiChatRequest = {
    model: req.model,
    max_tokens: req.maxTokens,
    // The `system` role is valid inline for the OpenAI-compatible API (unlike Anthropic), so no lifting.
    // Kimi stays on the text-only path (S1: `supportsNativeTools` false), so block content is
    // flattened rather than mapped — an image becomes an explicit marker, never a silent drop.
    messages: req.messages.map<KimiChatMessage>((m) => ({
      role: m.role,
      content: contentToText(m.content),
    })),
  };
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map<KimiToolDef>((t) => ({
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
  // the literal "JSON", which the OpenAI-compatible API requires when this mode is on.
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

interface ProviderConfig {
  apiKey?: string;
  /** Inject a pre-configured axios instance (tests); otherwise one is built for the Moonshot API. */
  client?: AxiosInstance;
  /** Override the API root (e.g. the China endpoint api.moonshot.cn). Defaults to the global API. */
  baseURL?: string;
}

export class KimiProvider implements ModelProvider {
  readonly id: AIProvider = 'kimi';
  private readonly http: AxiosInstance;

  constructor(config: ProviderConfig) {
    this.http =
      config.client ?? sharedClient(config.baseURL ?? MOONSHOT_BASE_URL, config.apiKey ?? '');
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    // Errors (timeout/cancel/4xx/5xx) are normalized to AppError by the central client's interceptor.
    const res = await this.http.post<OpenAICompletion>('/chat/completions', toKimiParams(req), {
      signal,
      timeout: req.timeoutMs,
    });
    return fromOpenAIResult(res.data);
  }
}
