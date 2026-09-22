import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `permissionDecisionHistory` — the Permission Debug host reader. Pinned: it returns `[]` before the
 * database is ready, reads the journal by TYPE only (`ToolInvoked`/`PolicyBlocked`), filters by site
 * (registrable-domain match, not a raw string compare) and/or tool in memory, skips a row whose
 * payload does not match the expected shape rather than guessing, and respects the caller's `limit`.
 */

const readByTypes = vi.hoisted(() => vi.fn((): unknown[] => []));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: { readByTypes } }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const { permissionDecisionHistory } = await import('./permission-debug');

function row(ts: number, correlationId: string, payload: unknown) {
  return { ts, correlationId, payload, type: 'ToolInvoked', actor: 'agent' };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  readByTypes.mockReturnValue([]);
});

describe('permissionDecisionHistory', () => {
  it('returns [] and never touches the journal before the database is ready', () => {
    db.value = null;
    expect(permissionDecisionHistory({})).toEqual([]);
    expect(readByTypes).not.toHaveBeenCalled();
  });

  it('reads both decision journal types, newest-first', () => {
    permissionDecisionHistory({});
    expect(readByTypes).toHaveBeenCalledWith({ __db: true }, ['ToolInvoked', 'PolicyBlocked'], expect.any(Number));
  });

  it('maps a well-formed row to the DTO, including outcome and rememberedBy', () => {
    readByTypes.mockReturnValue([
      row(100, 'run-1', {
        toolName: 'browser_update_location',
        targetUrl: 'https://a.example/page',
        reason: 'state_change_confirm',
        riskTier: 'ui-write',
        decision: 'ask',
        outcome: 'approved',
        rememberedBy: 'plan_grant',
      }),
    ]);
    expect(permissionDecisionHistory({})).toEqual([
      {
        ts: 100,
        runId: 'run-1',
        toolName: 'browser_update_location',
        targetUrl: 'https://a.example/page',
        reason: 'state_change_confirm',
        riskTier: 'ui-write',
        decision: 'ask',
        outcome: 'approved',
        rememberedBy: 'plan_grant',
      },
    ]);
  });

  it('skips a row whose payload does not match the expected shape, rather than guessing', () => {
    readByTypes.mockReturnValue([
      row(100, 'run-1', { not: 'a decision payload' }),
      row(101, 'run-2', {
        toolName: 'browser_get_page',
        reason: 'read_allowed',
        decision: 'allow',
      }),
    ]);
    expect(permissionDecisionHistory({}).map((r) => r.runId)).toEqual(['run-2']);
  });

  it('filters by site using a registrable-domain match, not a raw string compare', () => {
    readByTypes.mockReturnValue([
      row(100, 'run-1', {
        toolName: 'a',
        targetUrl: 'https://www.example.com/page',
        reason: 'read_allowed',
        decision: 'allow',
      }),
      row(101, 'run-2', {
        toolName: 'b',
        targetUrl: 'https://evil.example.com.attacker.test/page',
        reason: 'read_allowed',
        decision: 'allow',
      }),
      row(102, 'run-3', { toolName: 'c', reason: 'read_allowed', decision: 'allow' }), // no site
    ]);
    const rows = permissionDecisionHistory({ site: 'example.com' });
    expect(rows.map((r) => r.runId)).toEqual(['run-1']);
  });

  it('filters by tool as a case-insensitive substring match', () => {
    readByTypes.mockReturnValue([
      row(100, 'run-1', { toolName: 'browser_update_location', reason: 'x', decision: 'allow' }),
      row(101, 'run-2', { toolName: 'file_delete_item', reason: 'x', decision: 'allow' }),
    ]);
    expect(permissionDecisionHistory({ tool: 'UPDATE' }).map((r) => r.runId)).toEqual(['run-1']);
  });

  it('respects the caller-supplied limit', () => {
    readByTypes.mockReturnValue([
      row(100, 'run-1', { toolName: 'a', reason: 'x', decision: 'allow' }),
      row(101, 'run-2', { toolName: 'b', reason: 'x', decision: 'allow' }),
      row(102, 'run-3', { toolName: 'c', reason: 'x', decision: 'allow' }),
    ]);
    expect(permissionDecisionHistory({ limit: 2 })).toHaveLength(2);
  });
});
