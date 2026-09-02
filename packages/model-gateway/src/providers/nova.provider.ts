import { createHttpClient, type AxiosInstance } from '@tepegoz/http';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from '../types';
import { fromOpenAIResult, type OpenAICompletion } from './openai.provider';
import { contentToText } from '../content';

/**
 * Amazon Nova adapter (L7) — talks to Amazon's OpenAI-compatible *consumer* Chat Completions REST
 * endpoint (`api.nova.amazon.com/v1`) over the central axios seam ({@link createHttpClient}); NO vendor
 * SDK. This is the plain Bearer-key developer API, NOT AWS Bedrock: there is no AWS account, no region
 * in the URL, and no SigV4 signing — the stored key is sent verbatim as `Authorization: Bearer …`,
 * exactly like every other REST provider here.
 *
 * The RESPONSE shape is identical to OpenAI, so {@link fromOpenAIResult} is reused verbatim. The REQUEST
 * differs in one field: Nova documents `max_tokens` (not OpenAI's `max_completion_tokens`), so the
 * request builder here emits `max_tokens` — the same compat gap that made {@link KimiProvider} its own
 * adapter. A distinct `id: 'nova'` is required so the ModelGateway registry dispatches Nova runs
 * correctly.
 *
 * Like the other REST adapters, timeout/cancellation/error → AppError mapping (redacted) live in the
 * central client, so `complete()` is thin, and the request mapping is a pure function so it can be
 * unit-tested without a network call or an API key.
 */

const NOVA_BASE_URL = 'https://api.nova.amazon.com/v1';

interface NovaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NovaToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/** The Chat Completions request body this adapter sends (Nova expects `max_tokens`). */
export interface NovaChatRequest {
  model: string;
  max_tokens: number;
  messages: NovaChatMessage[];
  tools?: NovaToolDef[];
  response_format?: { type: 'json_object' };
}

/** Pure: canonical request → Amazon Nova Chat Completions request body. */
export function toNovaParams(req: CanonRequest): NovaChatRequest {
  const body: NovaChatRequest = {
    model: req.model,
    max_tokens: req.maxTokens,
    // The `system` role is valid inline for the OpenAI-compatible API (unlike Anthropic), so no lifting.
    // Nova stays on the text-only path (`supportsNativeTools` false), so block content is flattened
    // rather than mapped — an image becomes an explicit marker, never a silent drop.
    messages: req.messages.map<NovaChatMessage>((m) => ({
      role: m.role,
      content: contentToText(m.content),
    })),
  };
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map<NovaToolDef>((t) => ({
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
  /** Inject a pre-configured axios instance (tests); otherwise one is built for the Nova API. */
  client?: AxiosInstance;
  /** Override the API root (e.g. a gateway proxy, or the Bedrock-hosted variant). Defaults to the
   *  public consumer API. `undefined` ⇒ that default. */
  baseURL?: string | undefined;
}

export class NovaProvider implements ModelProvider {
  readonly id: AIProvider = 'nova';
  /**
   * Deliberately NOT native (matches {@link KimiProvider}). The Nova consumer API is
   * OpenAI-*compatible*, not OpenAI: its compat surface is partial (it needs `max_tokens`, not
   * `max_completion_tokens`), so putting it on the native tool path would claim a round trip we have
   * not verified against the real API. It keeps the proven JSON-in-text path, which works on every
   * model.
   */
  readonly supportsNativeTools = false;
  private readonly http: AxiosInstance;

  constructor(config: ProviderConfig) {
    this.http =
      config.client ?? sharedClient(config.baseURL ?? NOVA_BASE_URL, config.apiKey ?? '');
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    // Errors (timeout/cancel/4xx/5xx) are normalized to AppError by the central client's interceptor.
    const res = await this.http.post<OpenAICompletion>('/chat/completions', toNovaParams(req), {
      signal,
      timeout: req.timeoutMs,
    });
    return fromOpenAIResult(res.data);
  }
}
