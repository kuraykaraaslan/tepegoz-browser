import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerDownloadTools, type DownloadToolsHost } from './download-tools';

describe('download tools', () => {
  it('registers policy-gated download tools', () => {
    CapabilityRegistry.reset();
    const host: DownloadToolsHost = {
      listDownloads: () => [],
      getDownload: () => null,
      createDownload: () => ({ ok: true }),
      commandDownload: () => ({ ok: true }),
    };

    registerDownloadTools({ host });

    const tools = CapabilityRegistry.list();
    expect(tools.map((tool) => tool.id).sort()).toEqual([
      'download_create_item',
      'download_get_item',
      'download_list_items',
      'download_update_item',
    ]);
    expect(tools.find((tool) => tool.id === 'download_create_item')?.requiresIdempotencyKey).toBe(true);
    expect(tools.find((tool) => tool.id === 'download_update_item')?.dangerClass).toBe('state_changing');
  });
});
