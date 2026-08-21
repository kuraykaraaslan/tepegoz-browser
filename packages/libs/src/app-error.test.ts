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

  it('localizes a coded error at a human-facing boundary', () => {
    const err = new AppError('Download not found', 404, 'downloadNotFound');
    expect(toBoundary(err, () => 'Bu indirme artık listede yok.')).toEqual({
      message: 'Bu indirme artık listede yok.',
      statusCode: 404,
    });
  });

  it('keeps the ENGLISH message where no localizer is passed', () => {
    // The tool path deliberately omits the localizer: `orchestrator/recovery.ts` regex-matches this
    // text to choose recovery advice, and the reactor feeds it to the model verbatim. A Turkish string
    // here would silently break agent recovery in a Turkish locale.
    const err = new AppError('Element refs are stale', 409, 'staleRefs');
    expect(toBoundary(err).message).toBe('Element refs are stale');
  });

  it('falls back to the English message when the code has no translation', () => {
    const err = new AppError('Download not found', 404, 'downloadNotFound');
    expect(toBoundary(err, () => undefined).message).toBe('Download not found');
  });

  it('leaves an uncoded error untouched, so adoption is incremental', () => {
    const err = new AppError('plain', 400);
    expect(toBoundary(err, () => 'should not be used').message).toBe('plain');
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
