import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';
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
  // Single boundary: every rejected request leaves as a mapped, redacted AppError.
  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(normalizeHttpError(error)),
  );
  return instance;
}

/** Shared default instance for ad-hoc calls with no provider-specific base URL or auth. */
export const http = createHttpClient();
