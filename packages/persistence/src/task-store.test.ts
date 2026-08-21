import { describe, expect, it } from 'vitest';
import { skipWithoutNativeSqlite } from './native-abi';
import { defaultTaskPolicy, type TaskDefinition } from '@tepegoz/tasks';
import { migrate } from './migrations';
import { openDatabase, type Db } from './db';
import { TaskStore } from './task-store';

function memoryDb(): Db {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

function task(id: string, updatedAt: number): TaskDefinition {
  return {
    id,
    name: `Task ${id}`,
    prompt: 'Summarize this page',
    status: 'enabled',
    triggers: [{ type: 'interval', enabled: true, everyMinutes: 5 }],
    policy: defaultTaskPolicy(),
    createdAt: 1,
    updatedAt,
    nextRunAt: updatedAt + 100,
  };
}

describe.skipIf(skipWithoutNativeSqlite())('TaskStore', () => {
  it('stores and lists saved tasks newest first', () => {
    const db = memoryDb();
    TaskStore.upsert(db, task('old', 10));
    TaskStore.upsert(db, task('new', 20));

    expect(TaskStore.list(db).map((row) => row.id)).toEqual(['new', 'old']);
    expect(TaskStore.get(db, 'new')?.triggers[0]).toMatchObject({
      type: 'interval',
      everyMinutes: 5,
    });
  });

  it('round-trips the sourceConversationId column (migration v11)', () => {
    const db = memoryDb();
    TaskStore.upsert(db, { ...task('linked', 10), sourceConversationId: 'conv-42' });
    TaskStore.upsert(db, task('unlinked', 20));

    expect(TaskStore.get(db, 'linked')?.sourceConversationId).toBe('conv-42');
    // Absent column reads back as undefined, not null.
    expect(TaskStore.get(db, 'unlinked')?.sourceConversationId).toBeUndefined();
    expect('sourceConversationId' in (TaskStore.get(db, 'unlinked') ?? {})).toBe(false);
  });

  it('returns due enabled tasks', () => {
    const db = memoryDb();
    TaskStore.upsert(db, { ...task('due', 10), nextRunAt: 100 });
    TaskStore.upsert(db, { ...task('future', 20), nextRunAt: 10_000 });
    TaskStore.upsert(db, { ...task('off', 30), status: 'disabled', nextRunAt: 50 });

    expect(TaskStore.due(db, 500).map((row) => row.id)).toEqual(['due']);
  });

  it('stores run history, artifacts, and trigger state', () => {
    const db = memoryDb();
    TaskStore.upsert(db, task('task-1', 10));
    TaskStore.upsertRun(db, {
      id: 'run-1',
      taskId: 'task-1',
      correlationId: 'corr-1',
      triggerType: 'manual',
      status: 'queued',
      queuedAt: 100,
    });
    TaskStore.addArtifact(db, {
      id: 'art-1',
      taskId: 'task-1',
      runId: 'run-1',
      kind: 'text',
      title: 'Summary',
      createdAt: 200,
    });
    TaskStore.upsertTriggerState(db, {
      taskId: 'task-1',
      triggerKey: 'interval:0',
      lastCheckedAt: 300,
      nextCheckAt: 600,
      baselineHash: 'abc',
    });

    expect(TaskStore.listRuns(db, 'task-1')).toHaveLength(1);
    expect(TaskStore.listArtifacts(db, 'task-1')[0]?.title).toBe('Summary');
    expect(TaskStore.listTriggerState(db, 'task-1')[0]).toMatchObject({
      triggerKey: 'interval:0',
      baselineHash: 'abc',
    });
  });
});
