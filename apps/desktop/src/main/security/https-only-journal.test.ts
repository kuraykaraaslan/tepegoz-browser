import { beforeEach, describe, expect, it, vi } from 'vitest';

const append = vi.fn();
const getDb = vi.fn();
const warn = vi.fn();

vi.mock('@tepegoz/persistence', () => ({
  EventJournal: {
    append: (...a: unknown[]): void => {
      append(...a);
    },
  },
}));
vi.mock('../db/database.electron', () => ({ getDb: () => getDb() as unknown }));
vi.mock('@tepegoz/libs', () => ({
  Logger: {
    warn: (...a: unknown[]): void => {
      warn(...a);
    },
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const { journalHttpsOnlyBypass } = await import('./https-only-journal');

beforeEach(() => {
  vi.clearAllMocks();
  append.mockReset();
  getDb.mockReturnValue({ fake: 'db' });
});

function lastEvent(): Record<string, unknown> {
  return (append.mock.calls[0] as [unknown, Record<string, unknown>])[1];
}

describe('journalHttpsOnlyBypass', () => {
  it('records the host and tunnel kind as a user decision', () => {
    journalHttpsOnlyBypass('old.example', 'tor');
    const e = lastEvent();
    expect(e.type).toBe('HttpsOnlyBypassed');
    expect(e.actor).toBe('user');
    expect(e.redacted).toBe(true);
    expect(e.payload).toMatchObject({ host: 'old.example', tunnelKind: 'tor' });
  });

  it('carries no path or query', () => {
    journalHttpsOnlyBypass('old.example', 'vpn');
    const json = JSON.stringify(lastEvent());
    expect(json).not.toContain('://');
    expect(json).not.toContain('?');
    expect(Object.keys(lastEvent().payload as object).sort()).toEqual(['host', 'ts', 'tunnelKind']);
  });

  it('writes nothing and does not throw with no database', () => {
    getDb.mockReturnValue(null);
    expect(() => {
      journalHttpsOnlyBypass('a.example', 'unknown');
    }).not.toThrow();
    expect(append).not.toHaveBeenCalled();
  });

  it('swallows an append failure and logs it', () => {
    append.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => {
      journalHttpsOnlyBypass('a.example', 'socks');
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
