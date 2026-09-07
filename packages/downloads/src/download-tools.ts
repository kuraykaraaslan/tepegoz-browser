import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { DownloadCommandInput, DownloadCreateInput, DownloadRecord } from './index';
import { resolveMedia, type MediaProbe } from './media-resolver';
import {
  DownloadCommandInputSchema,
  DownloadCreateInputSchema,
  MediaResolveInputSchema,
} from './schemas';

export interface DownloadToolsHost {
  listDownloads(): DownloadRecord[];
  getDownload(id: string): DownloadRecord | null;
  createDownload(input: DownloadCreateInput): unknown;
  commandDownload(input: DownloadCommandInput): unknown;
  /** P3-c media resolver's network probe (HEAD / ranged-GET). See {@link MediaProbe}. */
  probeMedia: MediaProbe;
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

  CapabilityRegistry.register({
    descriptor: descriptor(
      'download_analyze_media',
      'read',
      "Resolve a public media URL (image/video/audio) into direct, verified metadata BEFORE downloading " +
        "it. Returns { kind: 'direct', url, contentType, contentLengthBytes, suggestedFilename } when the " +
        "URL IS the media bytes, or { kind: 'not_direct', reason, hint } when it is a page or unusable — " +
        'follow the hint (browse to it, or use web_get_page) instead of guessing. Read-only: it never ' +
        'saves anything — pass the resolved url to download_create_item to actually save it through the ' +
        'normal quarantine/trust gate. args: { url: string }.',
    ),
    inputSchema: MediaResolveInputSchema,
    handler: (args) => resolveMedia(args.url, host.probeMedia),
  });
}
