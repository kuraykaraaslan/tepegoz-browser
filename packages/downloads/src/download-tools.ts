import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { DownloadCommandInput, DownloadCreateInput, DownloadRecord } from './index';
import { DownloadCommandInputSchema, DownloadCreateInputSchema } from './schemas';

export interface DownloadToolsHost {
  listDownloads(): DownloadRecord[];
  getDownload(id: string): DownloadRecord | null;
  createDownload(input: DownloadCreateInput): unknown;
  commandDownload(input: DownloadCommandInput): unknown;
}

const NoArgs = z.object({}).strip();
const DownloadIdArgs = z.object({ id: z.string().min(1).max(128) });

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
    category: 'downloads',
  };
}

export function registerDownloadTools(deps: { host: DownloadToolsHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'download_list_items',
      'read',
      'List browser downloads. Returns redacted records without filesystem paths.',
    ),
    inputSchema: NoArgs,
    handler: () => host.listDownloads(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'download_get_item',
      'read',
      'Get one browser download by id. Returns a redacted record or null.',
    ),
    inputSchema: DownloadIdArgs,
    handler: (args) => host.getDownload(args.id),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'download_create_item',
      'state_changing',
      'Start a browser download through the active tab. Downloads are quarantined first; args: ' +
        '{ url, filename?, sourceUrl?, correlationId?, taskId?, idempotencyKey? }. Requires HITL.',
      true,
    ),
    inputSchema: DownloadCreateInputSchema,
    handler: (args) => host.createDownload({ ...args, actor: 'agent' }),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'download_update_item',
      'state_changing',
      'Run a download command by id: pause, resume, cancel, release, open, reveal, or clear. Requires HITL.',
    ),
    inputSchema: DownloadCommandInputSchema,
    handler: (args) => host.commandDownload(args),
  });
}
