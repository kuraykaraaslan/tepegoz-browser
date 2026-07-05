import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { AppError } from '@tepegoz/libs';
import { normalizeHttpError } from './http-client';
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
    const e = normalizeHttpError(axiosError({ status: 500, data: { error: { message: 'server error' } } }));
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
