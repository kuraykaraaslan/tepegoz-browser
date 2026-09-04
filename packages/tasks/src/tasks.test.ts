import { describe, expect, it } from 'vitest';
import {
  addTaskArtifact,
  defaultTaskPolicy,
  emptyTasksState,
  getTask,
  listTaskArtifacts,
  listTaskRuns,
  nextIntervalRunAt,
  normalizeTaskTrigger,
  patchTask,
  removeTask,
  taskCanUseTool,
  upsertTask,
  upsertTaskRun,
  type TaskDefinition,
} from './index';
import { TaskSaveInputSchema } from './schemas';

function task(id: string): TaskDefinition {
  const now = 1000;
  return {
    id,
    name: `Task ${id}`,
    prompt: 'Summarize this page',
    status: 'enabled',
    triggers: [{ type: 'manual' }],
    policy: defaultTaskPolicy(),
    createdAt: now,
    updatedAt: now,
  };
}

describe('@tepegoz/tasks', () => {
  it('normalizes interval/page triggers and keeps external disabled', () => {
    expect(normalizeTaskTrigger({ type: 'interval', enabled: true, everyMinutes: 1 })).toEqual({
      type: 'interval',
      enabled: true,
      everyMinutes: 5,
    });
    expect(
      normalizeTaskTrigger({
        type: 'pageChange',
        enabled: true,
        url: 'https://example.com',
        everyMinutes: 2,
        changeMode: 'textHash',
        fireOnFirstCheck: false,
      }),
    ).toMatchObject({ everyMinutes: 5, fireOnFirstCheck: false });
    expect(normalizeTaskTrigger({ type: 'external', source: 'telegram', enabled: false })).toEqual({
      type: 'external',
      source: 'telegram',
      enabled: false,
    });
  });

  it('calculates the next interval fire time', () => {
    expect(
      nextIntervalRunAt({ type: 'interval', enabled: false, everyMinutes: 5 }, 1000),
    ).toBeNull();
    expect(
      nextIntervalRunAt(
        { type: 'interval', enabled: true, everyMinutes: 5, startAt: 10_000 },
        1000,
      ),
    ).toBe(10_000);
    expect(
      nextIntervalRunAt({ type: 'interval', enabled: true, everyMinutes: 5, startAt: 0 }, 301_000),
    ).toBe(600_000);
  });

  it('maintains task, run, and artifact projections', () => {
    let state = emptyTasksState();
    state = upsertTask(state, task('a'));
    state = upsertTaskRun(state, {
      id: 'run-1',
      taskId: 'a',
      correlationId: 'corr-1',
      triggerType: 'manual',
      status: 'queued',
      queuedAt: 1,
    });
    state = addTaskArtifact(state, {
      id: 'art-1',
      taskId: 'a',
      runId: 'run-1',
      kind: 'text',
      title: 'Summary',
      createdAt: 2,
    });

    expect(getTask(state, 'a')?.name).toBe('Task a');
    expect(listTaskRuns(state, 'a')).toHaveLength(1);
    expect(listTaskArtifacts(state, 'a')).toHaveLength(1);
    expect(listTaskRuns(state)).toHaveLength(1); // no filter → all runs
    expect(listTaskArtifacts(state)).toHaveLength(1); // no filter → all artifacts
  });

  it('a manual trigger normalizes to itself', () => {
    expect(normalizeTaskTrigger({ type: 'manual' })).toEqual({ type: 'manual' });
  });

  it('upsertTask replaces an existing task in place (same id)', () => {
    let state = upsertTask(emptyTasksState(), task('a'));
    state = upsertTask(state, { ...task('a'), name: 'Renamed' });
    expect(state.tasks).toHaveLength(1);
    expect(getTask(state, 'a')?.name).toBe('Renamed');
  });

  it('upsertTaskRun replaces an existing run in place (same id)', () => {
    const run = {
      id: 'run-1',
      taskId: 'a',
      correlationId: 'c',
      triggerType: 'manual' as const,
      status: 'queued' as const,
      queuedAt: 1,
    };
    let state = upsertTaskRun(emptyTasksState(), run);
    state = upsertTaskRun(state, { ...run, status: 'running' });
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.status).toBe('running');
  });

  it('patchTask merges the patch, keeps id/createdAt, bumps updatedAt; no-ops an unknown id', () => {
    const state = upsertTask(emptyTasksState(), task('a'));
    const patched = patchTask(state, {
      id: 'a',
      patch: { status: 'disabled', updatedAt: 9_999 },
    });
    expect(getTask(patched, 'a')).toMatchObject({
      id: 'a',
      createdAt: 1000,
      status: 'disabled',
      updatedAt: 9_999,
    });
    expect(patchTask(state, { id: 'ghost', patch: { status: 'disabled' } })).toBe(state);
  });

  it('removeTask drops the task by id', () => {
    let state = upsertTask(emptyTasksState(), task('a'));
    state = upsertTask(state, task('b'));
    state = removeTask(state, 'a');
    expect(state.tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('validates task save input and preapproved policy checks', () => {
    const policy = {
      ...defaultTaskPolicy(),
      allowedReadTools: ['browser_get_page'],
      preapprovedWriteTools: ['browser_update_page'],
    };
    expect(
      TaskSaveInputSchema.safeParse({
        name: 'Watch',
        prompt: 'Watch this page',
        triggers: [{ type: 'manual' }],
        policy,
      }).success,
    ).toBe(true);
    expect(taskCanUseTool(policy, 'browser_get_page', 'read')).toBe(true);
    expect(taskCanUseTool(policy, 'browser_update_page', 'write')).toBe(true);
    expect(taskCanUseTool(policy, 'download_create_item', 'write')).toBe(false);
  });
});
