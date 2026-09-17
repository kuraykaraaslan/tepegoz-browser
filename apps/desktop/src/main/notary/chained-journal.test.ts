import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENESIS_HASH, selfHashOf } from '@tepegoz/notary';

/**
 * `appendChainedEvent` — the Phase 7 wiring point: chains one journal append onto the device's current
 * hash tail. This test does NOT mock `@tepegoz/notary` (a thin adapter is exactly where a real
 * integration check is cheap — same choice as `ipc-agent-run-report.electron.test.ts`). Pinned: the
 * first-ever chained event folds off `GENESIS_HASH`; a later one chains off `tailHash`, not off
 * `GENESIS_HASH` again; the computed `selfHash` matches what `selfHashOf` would produce independently
 * (so a verifier recomputing it agrees); and the write goes through `EventJournal.append` unchanged
 * otherwise — this function adds exactly two fields, nothing else.
 */

const journal = vi.hoisted(() => ({
  tailHash: vi.fn((): string | null => null),
  append: vi.fn((_db: unknown, input: Record<string, unknown>) => ({
    lsn: 1,
    deviceId: 'device-1',
    ...input,
  })),
}));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));

const { appendChainedEvent } = await import('./chained-journal');

const input = {
  id: 'e1',
  type: 'AgentStepExecuted' as const,
  ts: 1000,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { kind: 'step_ok', message: 'ok' },
  redacted: true,
};

describe('appendChainedEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journal.tailHash.mockReturnValue(null);
  });

  it('chains the first-ever event off GENESIS_HASH when nothing has been hashed yet', () => {
    journal.tailHash.mockReturnValue(null);
    appendChainedEvent({} as never, input);
    const call = journal.append.mock.calls[0]![1] as { prevHash: string; selfHash: string };
    expect(call.prevHash).toBe(GENESIS_HASH);
    expect(call.selfHash).toBe(selfHashOf(input, GENESIS_HASH));
  });

  it('chains a later event off tailHash, not off GENESIS_HASH', () => {
    const priorTail = 'c'.repeat(64);
    journal.tailHash.mockReturnValue(priorTail);
    appendChainedEvent({} as never, input);
    const call = journal.append.mock.calls[0]![1] as { prevHash: string; selfHash: string };
    expect(call.prevHash).toBe(priorTail);
    expect(call.selfHash).toBe(selfHashOf(input, priorTail));
  });

  it('adds prevHash/selfHash without altering any other field passed to EventJournal.append', () => {
    journal.tailHash.mockReturnValue(null);
    appendChainedEvent({} as never, input);
    const call = journal.append.mock.calls[0]![1];
    expect(call).toMatchObject(input);
  });

  it('passes the same db handle through to both tailHash and append', () => {
    const db = { marker: 'db-1' };
    journal.tailHash.mockReturnValue(null);
    appendChainedEvent(db as never, input);
    expect(journal.tailHash).toHaveBeenCalledWith(db);
    expect(journal.append.mock.calls[0]![0]).toBe(db);
  });

  it('returns whatever EventJournal.append returns (lsn/deviceId included)', () => {
    journal.tailHash.mockReturnValue(null);
    const record = appendChainedEvent({} as never, input);
    expect(record).toMatchObject({ lsn: 1, deviceId: 'device-1', id: 'e1' });
  });
});
