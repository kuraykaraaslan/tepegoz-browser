import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { defaultTaskPolicy, type TaskDefinition } from './index';
import { registerTaskTools, type TaskToolsHost } from './task-tools';

const savedTask: TaskDefinition = {
  id: 'task-1',
  name: 'Task 1',
  prompt: 'Do a thing',
  status: 'enabled',
  triggers: [{ type: 'manual' }],
  policy: defaultTaskPolicy(),
  createdAt: 1,
  updatedAt: 1,
};

describe('task tools', () => {
  it('registers task tools with HITL/idempotency metadata', () => {
    CapabilityRegistry.reset();
    const host: TaskToolsHost = {
      listTasks: () => [savedTask],
      getTask: (id) => (id === savedTask.id ? savedTask : null),
      saveTask: (input) => ({ ...savedTask, ...input }),
      commandTask: (input) => ({ ok: true, input }),
    };

    registerTaskTools({ host });

    const ids = CapabilityRegistry.list().map((tool) => tool.id).sort();
    expect(ids).toEqual([
      'task_create_item',
      'task_create_run',
      'task_get_item',
      'task_list_items',
      'task_update_item',
    ]);
    expect(CapabilityRegistry.get('task_create_item')?.descriptor.requiresIdempotencyKey).toBe(true);
    const runTool = CapabilityRegistry.get('task_create_run');
    expect(runTool?.descriptor.requiresIdempotencyKey).toBe(true);
    expect(runTool?.inputSchema.safeParse({
      id: 'task-1',
      action: 'disable',
      idempotencyKey: 'k',
    }).success).toBe(false);
    expect(runTool!.handler({
      id: 'task-1',
      action: 'run',
      idempotencyKey: 'k',
    })).toMatchObject({ ok: true });
  });
});
