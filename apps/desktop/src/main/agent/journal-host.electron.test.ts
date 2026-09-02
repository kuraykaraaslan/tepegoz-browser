import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `journalHost` — the desktop `JournalReader` that projects the append-only Event Journal for the
 * `journal_search_events` agent tool. Pinned: it returns `[]` (never throws) before the database is
 * ready, forwards `(db, limit, correlationId)` to `EventJournal.readRecent`, maps each row to the
 * compact projection, and the `summarize` rules — message only, message + detail joined, the
 * 200-char clamp, and `''` for anything that is not an object with a string message/detail.
 */

const readRecent = vi.hoisted(() => vi.fn((): unknown[] => []));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: { readRecent } }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const { journalHost } = await import('./journal-host.electron');

function row(payload: unknown) {
  return { type: 'AgentStep', ts: 10, actor: 'agent', correlationId: 'c1', payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  readRecent.mockReturnValue([]);
});

describe('recentEvents', () => {
  it('returns [] and never touches the journal before the database is ready', () => {
    db.value = null;
    expect(journalHost.recentEvents(20, undefined)).toEqual([]);
    expect(readRecent).not.toHaveBeenCalled();
  });

  it('forwards db + limit + correlationId and maps rows to the compact projection', () => {
    readRecent.mockReturnValue([row({ message: 'clicked Save' })]);
    const out = journalHost.recentEvents(5, 'corr-9');
    expect(readRecent).toHaveBeenCalledWith({ __db: true }, 5, 'corr-9');
    expect(out).toEqual([
      { type: 'AgentStep', ts: 10, actor: 'agent', correlationId: 'c1', summary: 'clicked Save' },
    ]);
  });
});

describe('summarize', () => {
  const summaryOf = (payload: unknown): string => {
    readRecent.mockReturnValue([row(payload)]);
    return journalHost.recentEvents(1, undefined)[0]!.summary;
  };

  it('joins message and detail with an em dash', () => {
    expect(summaryOf({ message: 'nav', detail: 'to /cart' })).toBe('nav — to /cart');
  });

  it('uses the message alone when there is no detail', () => {
    expect(summaryOf({ message: 'just a message' })).toBe('just a message');
  });

  it('clamps a long result to 200 chars plus an ellipsis', () => {
    const long = 'x'.repeat(500);
    const s = summaryOf({ message: long });
    expect(s).toHaveLength(201);
    expect(s.endsWith('…')).toBe(true);
  });

  it('is empty for a non-object payload', () => {
    expect(summaryOf('a bare string')).toBe('');
    expect(summaryOf(null)).toBe('');
    expect(summaryOf(42)).toBe('');
  });

  it('is empty for an object with no string message or detail', () => {
    expect(summaryOf({ message: 123, detail: {} })).toBe('');
    expect(summaryOf({})).toBe('');
  });
});
