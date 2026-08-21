import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { EventInput } from '@tepegoz/shared-types';
import { openDatabase, migrate, EventJournal, MetaStore, type Db } from './index';

function makeEvent(correlationId: string): EventInput {
  return {
    id: randomUUID(),
    type: 'AgentStepExecuted',
    ts: 1_700_000_000_000,
    actor: 'agent:worker-1',
    correlationId,
    payload: { step: 1 },
    redacted: true,
  };
}

describe('EventJournal', () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  it('appends events with monotonic lsn and a stable device id', () => {
    const a = EventJournal.append(db, makeEvent('run-1'));
    const b = EventJournal.append(db, makeEvent('run-1'));
    expect(a.lsn).toBe(1);
    expect(b.lsn).toBe(2);
    expect(a.deviceId).toBe(b.deviceId);
    expect(a.deviceId).toBe(MetaStore.deviceId(db));
  });

  it('reads back events after a given lsn, in order', () => {
    EventJournal.append(db, makeEvent('run-1'));
    EventJournal.append(db, makeEvent('run-2'));
    const all = EventJournal.readFrom(db, 0);
    expect(all.map((e) => e.correlationId)).toEqual(['run-1', 'run-2']);
    expect(EventJournal.readFrom(db, 1)).toHaveLength(1);
    expect(EventJournal.count(db)).toBe(2);
  });

  it('round-trips the payload', () => {
    const e = EventJournal.append(db, makeEvent('run-x'));
    const read = EventJournal.readFrom(db, e.lsn - 1)[0];
    expect(read?.payload).toEqual({ step: 1 });
  });

  it('reads recent events newest-first, capped by limit', () => {
    EventJournal.append(db, makeEvent('run-1'));
    EventJournal.append(db, makeEvent('run-2'));
    EventJournal.append(db, makeEvent('run-3'));
    const recent = EventJournal.readRecent(db, 2);
    expect(recent.map((e) => e.correlationId)).toEqual(['run-3', 'run-2']);
  });

  it('scopes recent events to one correlationId', () => {
    EventJournal.append(db, makeEvent('run-a'));
    EventJournal.append(db, makeEvent('run-b'));
    EventJournal.append(db, makeEvent('run-a'));
    const scoped = EventJournal.readRecent(db, 10, 'run-a');
    expect(scoped).toHaveLength(2);
    expect(scoped.every((e) => e.correlationId === 'run-a')).toBe(true);
  });

  it('clamps a non-positive or oversized limit', () => {
    EventJournal.append(db, makeEvent('run-1'));
    expect(EventJournal.readRecent(db, 0)).toHaveLength(0);
    expect(EventJournal.readRecent(db, -5)).toHaveLength(0);
    expect(EventJournal.readRecent(db, 10_000)).toHaveLength(1);
  });
});
