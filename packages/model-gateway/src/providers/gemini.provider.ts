import { createHttpClient, type AxiosInstance } from '@tepegoz/http';
import type { AIProvider } from '@tepegoz/shared-types';
import type {
  CanonRequest,
  CanonResponse,
  CanonStopReason,
  CanonToolCall,
  ModelProvider,
} from '../types';
import { contentToText } from '../content';

/**
 * Google Gemini adapter (L7) — talks to the Generative Language REST API directly over the central
 * axios seam ({@link createHttpClient}); NO vendor SDK (@tepegoz/http is the only outbound HTTP path).
 * Notes vs. the OpenAI/Anthropic adapters:
 *  - the cap is `generationConfig.maxOutputTokens` (enforced by the gateway).
 *  - roles differ: Gemini has `user` + `model` (not `assistant`), and the system prompt is lifted to
 *    the top-level `systemInstruction` (like Anthropic's `system`, unlike OpenAI's inline system role).
 *  - JSON mode is `generationConfig.responseMimeType = 'application/json'`.
 *  - tools are `tools[0].functionDeclarations`; a tool call arrives as a `functionCall` part with an
 *    already-parsed `args` object (no JSON-string parsing needed, unlike OpenAI).
 *  - the API key travels in the `x-goog-api-key` header (never the URL, so it can't leak into logs).
 *
 * Timeout, cancellation, and error → AppError mapping (redacted) live in the central client, so
 * `complete()` is thin. The request/response mapping is exposed as pure functions so it can be
 * unit-tested without a network call or an API key.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: unknown };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

/** The generateContent request body this adapter sends. */
export interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: { maxOutputTokens: number; responseMimeType?: 'application/json' };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
}

/** The subset of a generateContent response this adapter consumes. */
export interface GeminiGenerateResponse {
  candidates?: ReadonlyArray<{
    content?: { parts?: ReadonlyArray<GeminiPart>; role?: string };
    finishReason?: string | null;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null;
}

interface ProviderConfig {
  apiKey?: string;
  /** Inject a pre-configured axios instance (tests); otherwise one is built for the Gemini API. */
  client?: AxiosInstance;
  /** Override the API root (self-hosted / gateway proxies). Defaults to the public Gemini API. */
  baseURL?: string;
}

/** `model` roles: Gemini has no `assistant`. System is lifted out; assistant → `model`. */
function mapRole(role: CanonRequest['messages'][number]['role']): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function mapFinishReason(reason: string | null | undefined, hasToolCall: boolean): CanonStopReason {
  if (hasToolCall) return 'tool_use';
  switch (reason) {
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
      return 'error';
    // 'STOP' | null | undefined → a normal stop for the canon contract.
    default:
      return 'end';
  }
}

/** Pure: canonical request → Gemini generateContent request body. */
export function toGeminiParams(req: CanonRequest): GeminiGenerateRequest {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(contentToText(m.content));
      continue;
    }
    contents.push({ role: mapRole(m.role), parts: [{ text: contentToText(m.content) }] });
  }

  const body: GeminiGenerateRequest = {
    contents,
    generationConfig: { maxOutputTokens: req.maxTokens },
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }
  if (req.responseFormat === 'json') {
    body.generationConfig.responseMimeType = 'application/json';
  }
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: req.tools.map<GeminiFunctionDeclaration>((t) => ({
          name: t.name,
          description: t.description,
          // Opaque here; the capability plane is the authority on tool schemas.
          parameters: t.inputSchema,
        })),
      },
    ];
  }
  return body;
}

/** Pure: Gemini response → canonical response (first candidate's text + function calls + usage). */
export function fromGeminiResult(result: GeminiGenerateResponse): CanonResponse {
  const candidate = result.candidates?.[0];
  let text = '';
  const toolCalls: CanonToolCall[] = [];
  for (const part of candidate?.content?.parts ?? []) {
    if (typeof part.text === 'string') {
      text += part.text;
    } else if (part.functionCall !== undefined) {
      toolCalls.push({ name: part.functionCall.name, input: part.functionCall.args });
    }
  }
  return {
    text,
    stopReason: mapFinishReason(candidate?.finishReason ?? null, toolCalls.length > 0),
    usage: {
      inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
    },
    toolCalls,
  };
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
    client = createHttpClient({ baseURL, headers: { 'x-goog-api-key': apiKey } });
    clientByKey.set(cacheKey, client);
  }
  return client;
}

export class GeminiProvider implements ModelProvider {
  readonly id: AIProvider = 'gemini';
  private readonly http: AxiosInstance;

  constructor(config: ProviderConfig) {
    this.http =
      config.client ?? sharedClient(config.baseURL ?? GEMINI_BASE_URL, config.apiKey ?? '');
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    // Errors (timeout/cancel/4xx/5xx) are normalized to AppError by the central client's interceptor.
    const res = await this.http.post<GeminiGenerateResponse>(
      `/models/${req.model}:generateContent`,
      toGeminiParams(req),
      { signal, timeout: req.timeoutMs },
    );
    return fromGeminiResult(res.data);
  }
}
