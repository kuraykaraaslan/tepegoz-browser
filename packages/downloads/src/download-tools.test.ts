import { describe, expect, it, vi } from 'vitest';
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
      probeMedia: () => Promise.resolve(null),
    };

    registerDownloadTools({ host });

    const tools = CapabilityRegistry.list();
    expect(tools.map((tool) => tool.id).sort()).toEqual([
      'download_analyze_media',
      'download_create_item',
      'download_get_item',
      'download_list_items',
      'download_update_item',
    ]);
    expect(tools.find((tool) => tool.id === 'download_create_item')?.requiresIdempotencyKey).toBe(
      true,
    );
    expect(tools.find((tool) => tool.id === 'download_update_item')?.dangerClass).toBe(
      'state_changing',
    );
    expect(tools.find((tool) => tool.id === 'download_analyze_media')?.dangerClass).toBe('read');
  });

  it('resolves media through the probe host and never touches downloads state', async () => {
    CapabilityRegistry.reset();
    const probeMedia = vi.fn(() =>
      Promise.resolve({ status: 200, contentType: 'image/png', contentLengthBytes: 42, finalUrl: 'https://cdn.example.com/pic.png' }),
    );
    const host: DownloadToolsHost = {
      listDownloads: () => [],
      getDownload: () => null,
      createDownload: () => ({ ok: true }),
      commandDownload: () => ({ ok: true }),
      probeMedia,
    };
    registerDownloadTools({ host });

    const tool = CapabilityRegistry.list().find((t) => t.id === 'download_analyze_media');
    expect(tool).toBeDefined();
    const registered = CapabilityRegistry.get('download_analyze_media');
    const result = await registered?.handler({ url: 'https://cdn.example.com/pic.png?x=1' });

    expect(probeMedia).toHaveBeenCalledWith('https://cdn.example.com/pic.png?x=1');
    expect(result).toEqual({
      kind: 'direct',
      url: 'https://cdn.example.com/pic.png',
      contentType: 'image/png',
      contentLengthBytes: 42,
      suggestedFilename: 'pic.png',
    });
  });
});
