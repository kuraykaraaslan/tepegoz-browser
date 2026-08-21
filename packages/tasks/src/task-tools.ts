import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { TaskCommandInput, TaskDefinition, TaskSaveInput } from './tasks.model';
import { TaskCommandInputSchema, TaskSaveInputSchema } from './schemas';

export interface TaskToolsHost {
  listTasks(): TaskDefinition[];
  getTask(id: string): TaskDefinition | null;
  saveTask(input: TaskSaveInput): unknown;
  commandTask(input: TaskCommandInput): unknown;
}

const NoArgs = z.object({}).strip();
const TaskIdArgs = z.object({ id: z.string().min(1).max(128) });

function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  requiresIdempotencyKey = false,
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey,
    aiTask: 'none',
    category: 'tasks',
  };
}

export function registerTaskTools(deps: { host: TaskToolsHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'task_list_items',
      'read',
      'List saved agent tasks and trigger metadata. Does not expose secrets or artifact content.',
    ),
    inputSchema: NoArgs,
    handler: () => host.listTasks(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'task_get_item',
      'read',
      'Get one saved agent task by id. Returns trigger and policy metadata, not secrets.',
    ),
    inputSchema: TaskIdArgs,
    handler: (args) => host.getTask(args.id),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'task_create_item',
      'state_changing',
      'Create or update a saved agent task with triggers and a narrow policy. Requires HITL.',
      true,
    ),
    inputSchema: TaskSaveInputSchema,
    handler: (args) => host.saveTask(args),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'task_update_item',
      'state_changing',
      'Run a saved task command: cancel, enable, disable, or archive. Requires HITL.',
      true,
    ),
    inputSchema: TaskCommandInputSchema,
    handler: (args) => host.commandTask(args),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'task_create_run',
      'state_changing',
      'Queue a saved task to run now. Requires HITL and an idempotency key.',
      true,
    ),
    inputSchema: TaskCommandInputSchema.refine((input) => input.action === 'run', {
      message: 'task_create_run only accepts action "run"',
    }),
    handler: (args) => host.commandTask(args),
  });
}
