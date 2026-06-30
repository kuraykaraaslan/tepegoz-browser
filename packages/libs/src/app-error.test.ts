import { describe, it, expect } from 'vitest';
import { AppError, toBoundary } from './app-error';
import { Logger } from './logger';

describe('AppError', () => {
  it('maps AppError to its statusCode at the boundary', () => {
    expect(toBoundary(new AppError('nope', 403))).toEqual({ message: 'nope', statusCode: 403 });
  });

  it('maps unknown errors to 500', () => {
    expect(toBoundary(new Error('boom'))).toEqual({ message: 'Internal error', statusCode: 500 });
  });
});

describe('Logger.redact', () => {
  it('redacts an Anthropic key and a bearer token', () => {
    const out = Logger.redact('key sk-ant-abc123def456ghi789 and Bearer abcdef0123456789xyz');
    expect(out).not.toContain('sk-ant-');
    expect(out).not.toContain('Bearer abcdef');
    expect(out).toContain('[REDACTED]');
  });
});
