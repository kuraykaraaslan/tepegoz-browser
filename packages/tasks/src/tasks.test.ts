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
    expect(nextIntervalRunAt({ type: 'interval', enabled: false, everyMinutes: 5 }, 1000)).toBeNull();
    expect(nextIntervalRunAt({ type: 'interval', enabled: true, everyMinutes: 5, startAt: 10_000 }, 1000))
      .toBe(10_000);
    expect(nextIntervalRunAt({ type: 'interval', enabled: true, everyMinutes: 5, startAt: 0 }, 301_000))
      .toBe(600_000);
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
  });

  it('validates task save input and preapproved policy checks', () => {
    const policy = {
      ...defaultTaskPolicy(),
      allowedReadTools: ['browser_get_page'],
      preapprovedWriteTools: ['browser_update_page'],
    };
    expect(TaskSaveInputSchema.safeParse({
      name: 'Watch',
      prompt: 'Watch this page',
      triggers: [{ type: 'manual' }],
      policy,
    }).success).toBe(true);
    expect(taskCanUseTool(policy, 'browser_get_page', 'read')).toBe(true);
    expect(taskCanUseTool(policy, 'browser_update_page', 'write')).toBe(true);
    expect(taskCanUseTool(policy, 'download_create_item', 'write')).toBe(false);
  });
});
