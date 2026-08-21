import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { AppError } from '@tepegoz/libs';
import { backoffMs, createHttpClient, normalizeHttpError, retryAfterMs } from './http-client';
import { HttpMessages } from './messages';

function axiosError(opts: {
  message?: string;
  code?: string;
  status?: number;
  data?: unknown;
}): AxiosError {
  const response =
    opts.status === undefined
      ? undefined
      : ({
          status: opts.status,
          data: opts.data,
          statusText: '',
          headers: {},
          config: {},
        } as AxiosResponse);
  return new AxiosError(opts.message ?? 'boom', opts.code, undefined, undefined, response);
}

describe('normalizeHttpError', () => {
  it('maps client-side timeouts to 503', () => {
    const e = normalizeHttpError(axiosError({ code: 'ECONNABORTED' }));
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe(HttpMessages.RequestTimedOut);
  });

  it('maps aborted requests to 503', () => {
    const e = normalizeHttpError(axiosError({ code: 'ERR_CANCELED' }));
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe(HttpMessages.RequestCanceled);
  });

  it('passes 4xx through and prefers the provider error message', () => {
    const e = normalizeHttpError(
      axiosError({ status: 401, data: { error: { message: 'Invalid API key' } } }),
    );
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe('Invalid API key');
  });

  it('treats 5xx as upstream-down (503)', () => {
    const e = normalizeHttpError(
      axiosError({ status: 500, data: { error: { message: 'server error' } } }),
    );
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe('server error');
  });

  it('redacts secrets that leak into an error message', () => {
    const leaked = 'bad key sk-ant-abcdefghijklmnop1234567890';
    const e = normalizeHttpError(axiosError({ status: 400, data: { error: { message: leaked } } }));
    expect(e.message).not.toContain('sk-ant-');
    expect(e.message).toContain('[REDACTED]');
  });

  it('maps a network failure (no response) to 503', () => {
    const e = normalizeHttpError(axiosError({ code: 'ERR_NETWORK', message: 'Network Error' }));
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe('Network Error');
  });

  it('passes an AppError through unchanged', () => {
    const original = new AppError('already mapped', 429);
    expect(normalizeHttpError(original)).toBe(original);
  });

  it('maps a non-axios throw to a generic 503', () => {
    const e = normalizeHttpError(new Error('weird'));
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe(HttpMessages.UnknownHttpError);
  });
});

describe('retryAfterMs', () => {
  it('reads a numeric Retry-After header as delta-seconds', () => {
    expect(retryAfterMs({ 'retry-after': '2' }, undefined)).toBe(2000);
  });

  it('reads an HTTP-date Retry-After relative to now', () => {
    const now = 1_000_000;
    const when = new Date(now + 3000).toUTCString();
    const ms = retryAfterMs({ 'Retry-After': when }, undefined, now);
    // toUTCString drops sub-second precision, so allow a 1s slack.
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(3000);
  });

  it('falls back to the provider message "try again in Xms" hint', () => {
    expect(retryAfterMs({}, 'Rate limit reached ... Please try again in 444ms.')).toBe(444);
  });

  it('parses a "try again in X.Ys" (seconds) hint', () => {
    expect(retryAfterMs({}, 'try again in 1.5s')).toBe(1500);
  });

  it('returns null when no hint is present (caller uses exponential backoff)', () => {
    expect(retryAfterMs({}, 'some other error')).toBeNull();
    expect(retryAfterMs(undefined, undefined)).toBeNull();
  });
});

describe('backoffMs', () => {
  it('uses the server hint when given, capped', () => {
    expect(backoffMs(0, 300)).toBeGreaterThanOrEqual(300);
    expect(backoffMs(0, 300)).toBeLessThan(300 + 200); // + jitter
    expect(backoffMs(0, 999_999)).toBeLessThanOrEqual(10_000 + 200); // capped
  });

  it('grows exponentially with the attempt when no hint', () => {
    expect(backoffMs(0, null)).toBeGreaterThanOrEqual(500);
    expect(backoffMs(2, null)).toBeGreaterThanOrEqual(2000); // 0.5·2^2 = 2s
  });
});

/** A stub axios adapter that fails the first `fails` calls with a 429 (with `data`), then returns 200. */
function stub429Then200(
  fails: number,
  data: unknown,
): { adapter: AxiosAdapter; calls: () => number } {
  let calls = 0;
  const adapter: AxiosAdapter = (config) => {
    calls += 1;
    if (calls <= fails) {
      const response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        data,
        config,
      } as AxiosResponse;
      return Promise.reject(new AxiosError('rate limited', undefined, config, undefined, response));
    }
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { ok: true },
      config,
    } as AxiosResponse);
  };
  return { adapter, calls: () => calls };
}

describe('createHttpClient — 429 retry', () => {
  it('backs off and retries a 429, then returns the eventual success', async () => {
    const client = createHttpClient();
    const { adapter, calls } = stub429Then200(2, { error: { message: 'try again in 1ms' } });
    client.defaults.adapter = adapter;
    const res = await client.get('http://example.test/x');
    expect(res.status).toBe(200);
    expect(calls()).toBe(3); // 2 rejected + 1 success
  });

  it('gives up after the retry budget and surfaces a mapped AppError', async () => {
    const client = createHttpClient();
    const { adapter, calls } = stub429Then200(99, { error: { message: 'try again in 1ms' } });
    client.defaults.adapter = adapter;
    await expect(client.get('http://example.test/x')).rejects.toBeInstanceOf(AppError);
    expect(calls()).toBe(7); // MAX_RETRIES_429 (6) + the initial attempt
  });

  it('retries a pre-send DNS failure (ENOTFOUND), then returns the eventual success', async () => {
    const client = createHttpClient();
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      if (calls <= 1) {
        return Promise.reject(
          new AxiosError('getaddrinfo ENOTFOUND api.x', 'ENOTFOUND', config, {}),
        );
      }
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { ok: true },
        config,
      } as AxiosResponse);
    };
    const res = await client.get('http://example.test/x');
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('does NOT retry an ambiguous post-send error (ECONNRESET) — could have reached the server', async () => {
    const client = createHttpClient();
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      return Promise.reject(new AxiosError('socket hang up', 'ECONNRESET', config, {}));
    };
    await expect(client.get('http://example.test/x')).rejects.toBeInstanceOf(AppError);
    expect(calls).toBe(1);
  });

  it('does not enter a retry loop when the request signal is already aborted', async () => {
    const client = createHttpClient();
    const { adapter, calls } = stub429Then200(99, { error: { message: 'try again in 1ms' } });
    client.defaults.adapter = adapter;
    const controller = new AbortController();
    controller.abort();
    // axios raises its own CanceledError for a pre-aborted signal; the invariant we guard is that the
    // 429 backoff loop never engages (no retry storm) once the caller has cancelled.
    await expect(
      client.get('http://example.test/x', { signal: controller.signal }),
    ).rejects.toBeDefined();
    expect(calls()).toBeLessThanOrEqual(1);
  });
});
