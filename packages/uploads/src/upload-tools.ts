import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { UploadCommandInput, UploadCreateInput, UploadRecord } from './index';
import { UploadCommandInputSchema, UploadCreateInputSchema } from './schemas';

export interface UploadToolsHost {
  listUploads(): UploadRecord[];
  getUpload(id: string): UploadRecord | null;
  createUpload(input: UploadCreateInput): unknown;
  commandUpload(input: UploadCommandInput): unknown;
}

const NoArgs = z.object({}).strip();
const UploadIdArgs = z.object({ id: z.string().min(1).max(128) });

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
    category: 'uploads',
  };
}

export function registerUploadTools(deps: { host: UploadToolsHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'upload_list_items',
      'read',
      'List browser upload activity. Returns redacted records without filesystem paths or content.',
    ),
    inputSchema: NoArgs,
    handler: () => host.listUploads(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'upload_get_item',
      'read',
      'Get one browser upload by id. Returns a redacted record or null.',
    ),
    inputSchema: UploadIdArgs,
    handler: (args) => host.getUpload(args.id),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'upload_create_item',
      'state_changing',
      'Bind one or more local files to a page file input through the active tab. Args: ' +
        '{ tabId?, ref, paths, purpose?, sourceUrl?, correlationId?, taskId?, idempotencyKey? }. ' +
        'Requires HITL and file sandbox access; paths are never returned to the renderer or model.',
      true,
    ),
    inputSchema: UploadCreateInputSchema,
    handler: (args) => host.createUpload({ ...args, actor: 'agent' }),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'upload_update_item',
      'state_changing',
      'Run an upload command by id: cancel or clear. Requires HITL.',
    ),
    inputSchema: UploadCommandInputSchema,
    handler: (args) => host.commandUpload(args),
  });
}
