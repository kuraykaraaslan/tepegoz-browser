import { describe, it, expect } from 'vitest';
import { AppError } from '@tepegoz/libs';
import { BLOCKED_HOST_CODE, normalizeHttpError } from './http-client';
import { HttpMessages } from './messages';
import { axiosError } from './http-client.testkit';

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

  it('maps the resolve-then-pin block code to the same 400 the pre-send check raises', () => {
    const e = normalizeHttpError(axiosError({ code: BLOCKED_HOST_CODE }));
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe(HttpMessages.BlockedNonPublicHost);
  });
});

describe('reading a provider error out of the body', () => {
  it('prefers `{ error: { message } }`, the shape OpenAI and Anthropic use', () => {
    const e = normalizeHttpError(
      axiosError({
        status: 400,
        message: 'Request failed',
        data: { error: { message: 'bad key' } },
      }),
    );
    expect(e.message).toBe('bad key');
  });

  it('accepts the flat `{ error: "..." }` shape too', () => {
    const e = normalizeHttpError(
      axiosError({ status: 400, message: 'Request failed', data: { error: 'quota exhausted' } }),
    );
    expect(e.message).toBe('quota exhausted');
  });

  it('falls back to axios own message for a body that carries no usable one', () => {
    // Anything but a non-empty string in the right place is not a message: an empty string, a number,
    // an error object with no message, a body with no `error` key at all, or no body.
    const bodies: unknown[] = [
      { error: '' },
      { error: 42 },
      { error: {} },
      { error: { message: '' } },
      { error: { message: 7 } },
      { detail: 'not our shape' },
      null,
      'a bare string body',
    ];
    for (const data of bodies) {
      const e = normalizeHttpError(axiosError({ status: 400, message: 'Request failed', data }));
      expect(e.message, JSON.stringify(data)).toBe('Request failed');
    }
  });
});
