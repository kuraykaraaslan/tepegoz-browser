import axios, {
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios';
import { AppError, Logger } from '@tepegoz/libs';
import { HttpMessages } from './messages';

/**
 * The ONE outbound-HTTP seam for the whole app. Every REST integration (LLM providers, MCP HTTP
 * transports, future backend) is built on {@link createHttpClient} instead of pulling a vendor SDK,
 * so retries, timeouts, redaction, and error mapping live in a single place. No Electron, no app
 * imports — pure Node/browser.
 *
 * Guarantees a caller gets from any instance made here:
 *  - a per-request timeout (internal-ai-rules: no untimed outbound call), defaulting to
 *    {@link DEFAULT_TIMEOUT_MS} and overridable per request;
 *  - every rejection normalized to an {@link AppError} with an HTTP-semantic status code
 *    (4xx passthrough, everything else → 503) and a secret-redacted message.
 */

export interface HttpClientOptions {
  /** Prepended to relative request URLs (e.g. an API root like `https://api.openai.com/v1`). */
  baseURL?: string;
  /** Default per-request timeout (ms). Overridable per call via the request config. */
  timeoutMs?: number;
  /** Default headers merged onto every request (e.g. `Authorization`). */
  headers?: Record<string, string>;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Axios error `code`s that mean "the request ran out of time" (client-side deadline hit). */
const TIMEOUT_CODES: ReadonlySet<string> = new Set(['ECONNABORTED', 'ETIMEDOUT']);
/** Axios error `code` for an aborted request (AbortSignal / CancelToken). */
const CANCELED_CODE = 'ERR_CANCELED';

/** LLM/REST providers commonly shape errors as `{ error: { message } }` (OpenAI, Anthropic) or
 *  `{ error: '...' }`. Pull the human message out of whichever shape is present. */
function extractProviderMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error.length > 0) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return undefined;
}

/**
 * Map any thrown value from an axios call to an {@link AppError}. Pure (no network) so it is unit
 * tested directly. Timeouts/cancels and connection failures are "upstream down" (503); a 4xx response
 * is passed through as the caller's fault; the provider's own error message is preferred and always
 * redacted before it can reach a log or the Agent Console.
 */
export function normalizeHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (axios.isAxiosError(err)) {
    if (err.code !== undefined && TIMEOUT_CODES.has(err.code)) {
      return new AppError(HttpMessages.RequestTimedOut, 503);
    }
    if (err.code === CANCELED_CODE) {
      return new AppError(HttpMessages.RequestCanceled, 503);
    }
    const status = err.response?.status;
    if (typeof status === 'number') {
      const message = extractProviderMessage(err.response?.data) ?? err.message;
      // 4xx = our request/auth/policy fault (pass through); 5xx/other = upstream down.
      const code = status >= 400 && status < 500 ? status : 503;
      return new AppError(Logger.redact(message), code);
    }
    // No response at all → DNS/connection/network failure.
    return new AppError(Logger.redact(err.message), 503);
  }
  return new AppError(HttpMessages.UnknownHttpError, 503);
}

/** Max automatic retries for a 429. A 429 means the request was REJECTED (never processed), so a retry
 *  is safe even for a non-idempotent POST — nothing ran. Bounded so a persistently rate-limited endpoint
 *  still fails within a caller's own deadline instead of looping. */
const MAX_RETRIES_429 = 6;
/** Upper bound on a single backoff wait (ms) — a huge server `Retry-After` cannot hang a run unbounded. */
const MAX_BACKOFF_MS = 10_000;
/** Random jitter added to each backoff (ms) to de-synchronise concurrent rate-limited callers. */
const BACKOFF_JITTER_MS = 200;

/**
 * The wait (ms) a 429 asks for: prefer the `Retry-After` header (delta-seconds or an HTTP-date), then
 * the provider message's "try again in Xms / X.Ys" hint (OpenAI/Anthropic word the wait in the body).
 * Returns null when neither is present, so the caller falls back to exponential backoff. Pure — unit
 * tested; `now` is injected so the HTTP-date branch is deterministic in tests.
 */
export function retryAfterMs(headers: unknown, message: string | undefined, now = Date.now()): number | null {
  const bag = typeof headers === 'object' && headers !== null ? (headers as Record<string, unknown>) : {};
  const rawHeader = bag['retry-after'] ?? bag['Retry-After'];
  if (typeof rawHeader === 'string' && rawHeader.length > 0) {
    const secs = Number(rawHeader);
    if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1000));
    const when = Date.parse(rawHeader);
    if (!Number.isNaN(when)) return Math.max(0, when - now);
  }
  if (typeof message === 'string') {
    const inMs = /try again in\s+([\d.]+)\s*ms/i.exec(message);
    if (inMs?.[1] !== undefined) return Math.max(0, Math.round(Number(inMs[1])));
    const inS = /try again in\s+([\d.]+)\s*s/i.exec(message);
    if (inS?.[1] !== undefined) return Math.max(0, Math.round(Number(inS[1]) * 1000));
  }
  return null;
}

/** Backoff for the nth (0-based) 429 retry: the server's hint if given, else exponential (0.5·2^n),
 *  both capped at {@link MAX_BACKOFF_MS}, plus jitter. Pure except for the jitter draw. */
export function backoffMs(attempt: number, hintMs: number | null): number {
  const base = hintMs ?? 500 * 2 ** attempt;
  return Math.min(MAX_BACKOFF_MS, Math.max(0, base)) + Math.floor(Math.random() * BACKOFF_JITTER_MS);
}

/** A cancel-aware delay: resolves after `ms`, or rejects (RequestCanceled) the instant `signal` aborts,
 *  so a backing-off retry does not outlive a cancelled run. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new AppError(HttpMessages.RequestCanceled, 503));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AppError(HttpMessages.RequestCanceled, 503));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Build a configured axios instance. Use this everywhere outbound HTTP is needed — do NOT construct
 * `axios` directly or add a vendor SDK.
 */
export function createHttpClient(options: HttpClientOptions = {}): AxiosInstance {
  // Build the config without an explicit `baseURL: undefined` (exactOptionalPropertyTypes forbids it).
  const config: CreateAxiosDefaults = {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  };
  if (options.baseURL !== undefined) {
    config.baseURL = options.baseURL;
  }
  const instance = axios.create(config);
  // Single boundary: a 429 (rate limited → request REJECTED, not processed) is backed off and retried,
  // bounded + cancel-aware + honoring Retry-After; everything else — or a 429 past the retry budget —
  // leaves as a mapped, redacted AppError. This is the one place retries are meant to live (see header).
  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 429 && error.config) {
        const cfg = error.config as InternalAxiosRequestConfig & { retry429?: number };
        const attempt = cfg.retry429 ?? 0;
        const signal = cfg.signal as AbortSignal | undefined;
        if (attempt < MAX_RETRIES_429 && signal?.aborted !== true) {
          cfg.retry429 = attempt + 1;
          const wait = backoffMs(attempt, retryAfterMs(error.response.headers, extractProviderMessage(error.response.data)));
          Logger.info('http 429: backing off before retry', { attempt: attempt + 1, waitMs: wait });
          await delay(wait, signal);
          return instance(cfg);
        }
      }
      throw normalizeHttpError(error);
    },
  );
  return instance;
}

/** Shared default instance for ad-hoc calls with no provider-specific base URL or auth. */
export const http = createHttpClient();
