import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { AppError } from '@tepegoz/libs';
import { backoffMs, createHttpClient, retryAfterMs } from './http-client';
import { stub429Then200 } from './http-client.testkit';

/**
 * One branch stays uncovered: `delay`'s already-aborted early return. The retry path checks
 * `signal.aborted` immediately before calling it, so reaching that line needs an abort to land
 * between the check and the next statement — a race no test can stage, and `delay` is not exported.
 */

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

describe('createHttpClient — a cancelled run stops retrying', () => {
  it('does not retry a 429 once the caller has aborted', async () => {
    // The backoff must not outlive the run it belongs to: a cancelled agent step should stop making
    // requests, not keep paying for them.
    const client = createHttpClient();
    const controller = new AbortController();
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      controller.abort();
      return Promise.reject(
        new AxiosError('rate limited', undefined, config, {}, {
          status: 429,
          statusText: '',
          headers: {},
          data: {},
          config,
        } as AxiosResponse),
      );
    };

    await expect(
      client.get('http://example.test/x', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AppError);
    expect(calls).toBe(1);
  });

  it('rejects mid-backoff when the caller aborts while it is waiting', async () => {
    const client = createHttpClient();
    const controller = new AbortController();
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      if (calls === 1) setTimeout(() => controller.abort(), 0);
      return Promise.reject(
        new AxiosError('rate limited', undefined, config, {}, {
          status: 429,
          statusText: '',
          // a long Retry-After, so the abort lands while the backoff is still waiting
          headers: { 'retry-after': '30' },
          data: {},
          config,
        } as AxiosResponse),
      );
    };

    await expect(
      client.get('http://example.test/x', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AppError);
    expect(calls).toBe(1);
  });
});
