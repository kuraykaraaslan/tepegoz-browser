import { describe, expect, it } from 'vitest';
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

describe('TaskStore', () => {
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

  it('round-trips every optional task column, and OMITS the key when the column is null', () => {
    // These records cross IPC and are zod-parsed at the boundary, where the optional fields are
    // `string | undefined`, not `string | null`. So the row mapper has two jobs and both matter: a
    // populated column must survive, and an empty one must leave the key ABSENT rather than present
    // with a null the schema would reject.
    const db = memoryDb();
    TaskStore.upsert(db, {
      ...task('full', 10),
      description: 'Checks the docs page every morning',
      targetUrl: 'https://example.test/docs',
      targetOrigin: 'https://example.test',
      lastRunAt: 900,
      nextRunAt: 1000,
    });
    TaskStore.upsert(db, {
      id: 'bare',
      name: 'Bare',
      prompt: 'p',
      status: 'enabled',
      triggers: [],
      policy: defaultTaskPolicy(),
      createdAt: 1,
      updatedAt: 20,
    });

    expect(TaskStore.get(db, 'full')).toMatchObject({
      description: 'Checks the docs page every morning',
      targetUrl: 'https://example.test/docs',
      targetOrigin: 'https://example.test',
      lastRunAt: 900,
      nextRunAt: 1000,
    });

    const bare = TaskStore.get(db, 'bare') ?? {};
    for (const key of ['description', 'targetUrl', 'targetOrigin', 'lastRunAt', 'nextRunAt']) {
      expect(key in bare, key).toBe(false);
    }
  });

  it('round-trips every optional run, artifact and trigger-state column the same way', () => {
    const db = memoryDb();
    TaskStore.upsert(db, task('task-1', 10));

    TaskStore.upsertRun(db, {
      id: 'run-full',
      taskId: 'task-1',
      correlationId: 'corr-1',
      triggerType: 'manual',
      triggerSource: 'user',
      status: 'succeeded',
      queuedAt: 100,
      startedAt: 110,
      completedAt: 190,
      summary: 'all good',
      error: 'a warning that was still recorded',
    });
    TaskStore.addArtifact(db, {
      id: 'art-full',
      taskId: 'task-1',
      runId: 'run-full',
      kind: 'file',
      title: 'Report',
      summary: 'the summary',
      mimeType: 'application/pdf',
      blobRef: 'cas://abc',
      path: '/tmp/report.pdf',
      url: 'https://example.test/report.pdf',
      createdAt: 200,
    });
    TaskStore.upsertTriggerState(db, {
      taskId: 'task-1',
      triggerKey: 'watch:0',
      lastCheckedAt: 300,
      lastFiredAt: 350,
      nextCheckAt: 600,
      baselineHash: 'abc',
      baselinePreview: 'the page said this',
      error: 'last check failed',
    });

    expect(TaskStore.listRuns(db, 'task-1')[0]).toMatchObject({
      triggerSource: 'user',
      startedAt: 110,
      completedAt: 190,
      summary: 'all good',
      error: 'a warning that was still recorded',
    });
    expect(TaskStore.listArtifacts(db, 'task-1')[0]).toMatchObject({
      summary: 'the summary',
      mimeType: 'application/pdf',
      blobRef: 'cas://abc',
      path: '/tmp/report.pdf',
      url: 'https://example.test/report.pdf',
    });
    expect(TaskStore.listTriggerState(db, 'task-1')[0]).toMatchObject({
      lastCheckedAt: 300,
      lastFiredAt: 350,
      nextCheckAt: 600,
      baselineHash: 'abc',
      baselinePreview: 'the page said this',
      error: 'last check failed',
    });
  });

  it('omits every optional run, artifact and trigger-state key when the column is null', () => {
    const db = memoryDb();
    TaskStore.upsert(db, task('task-1', 10));
    TaskStore.upsertRun(db, {
      id: 'run-bare',
      taskId: 'task-1',
      correlationId: 'corr-1',
      triggerType: 'manual',
      status: 'queued',
      queuedAt: 100,
    });
    TaskStore.addArtifact(db, {
      id: 'art-bare',
      taskId: 'task-1',
      runId: 'run-bare',
      kind: 'text',
      title: 'Bare',
      createdAt: 200,
    });
    TaskStore.upsertTriggerState(db, { taskId: 'task-1', triggerKey: 'interval:0' });

    const run = TaskStore.listRuns(db, 'task-1')[0] ?? {};
    for (const key of ['triggerSource', 'startedAt', 'completedAt', 'summary', 'error']) {
      expect(key in run, key).toBe(false);
    }
    const artifact = TaskStore.listArtifacts(db, 'task-1')[0] ?? {};
    for (const key of ['summary', 'mimeType', 'blobRef', 'path', 'url']) {
      expect(key in artifact, key).toBe(false);
    }
    const state = TaskStore.listTriggerState(db, 'task-1')[0] ?? {};
    for (const key of [
      'lastCheckedAt',
      'lastFiredAt',
      'nextCheckAt',
      'baselineHash',
      'baselinePreview',
      'error',
    ]) {
      expect(key in state, key).toBe(false);
    }
  });

  it('returns null for a task that is not there, and deletes one that is', () => {
    const db = memoryDb();
    expect(TaskStore.get(db, 'never-existed')).toBeNull();

    TaskStore.upsert(db, task('doomed', 10));
    expect(TaskStore.get(db, 'doomed')).not.toBeNull();
    TaskStore.delete(db, 'doomed');
    expect(TaskStore.get(db, 'doomed')).toBeNull();
    expect(TaskStore.list(db)).toEqual([]);
  });

  it('lists runs, artifacts and trigger state ACROSS tasks when no task id is given', () => {
    // The cross-task view is what the Task Manager reads; the per-task one is what a task's own
    // detail page reads. They are different queries, and only the second had ever run.
    const db = memoryDb();
    TaskStore.upsert(db, task('a', 10));
    TaskStore.upsert(db, task('b', 20));
    for (const id of ['a', 'b']) {
      TaskStore.upsertRun(db, {
        id: `run-${id}`,
        taskId: id,
        correlationId: `corr-${id}`,
        triggerType: 'manual',
        status: 'queued',
        queuedAt: 100,
      });
      TaskStore.addArtifact(db, {
        id: `art-${id}`,
        taskId: id,
        runId: `run-${id}`,
        kind: 'text',
        title: `Title ${id}`,
        createdAt: 200,
      });
      TaskStore.upsertTriggerState(db, { taskId: id, triggerKey: 'interval:0' });
    }

    expect(
      TaskStore.listRuns(db)
        .map((r) => r.taskId)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(
      TaskStore.listArtifacts(db)
        .map((r) => r.taskId)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(
      TaskStore.listTriggerState(db)
        .map((r) => r.taskId)
        .sort(),
    ).toEqual(['a', 'b']);
    // and the per-task query still narrows
    expect(TaskStore.listRuns(db, 'a').map((r) => r.taskId)).toEqual(['a']);
  });

  it('survives a row whose triggers/policy JSON is corrupt instead of throwing the list away', () => {
    // `triggers` and `policy` are JSON text columns. A truncated write or a hand-edited database
    // would otherwise take out the whole task list — one bad row, and `list()` throws before it can
    // return the good ones. The fallback is what makes the damage local to that task.
    const db = memoryDb();
    TaskStore.upsert(db, task('healthy', 20));
    TaskStore.upsert(db, task('corrupt', 10));
    db.prepare("UPDATE tasks SET triggers = '[not json', policy = '{also not' WHERE id = ?").run(
      'corrupt',
    );

    const rows = TaskStore.list(db);
    expect(rows.map((r) => r.id)).toEqual(['healthy', 'corrupt']);

    const corrupt = TaskStore.get(db, 'corrupt');
    expect(corrupt?.triggers).toEqual([]);
    // a policy that parsed as nothing must still be a CLOSED one — no origins, no pre-approvals
    expect(corrupt?.policy.allowedOrigins).toEqual([]);
    expect(corrupt?.policy.preapprovedWriteTools).toEqual([]);
  });
});
