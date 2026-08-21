import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerUploadTools, type UploadToolsHost } from './upload-tools';

describe('upload tools', () => {
  it('registers policy-gated upload tools', () => {
    CapabilityRegistry.reset();
    const host: UploadToolsHost = {
      listUploads: () => [],
      getUpload: () => null,
      createUpload: () => ({ ok: true }),
      commandUpload: () => ({ ok: true }),
    };

    registerUploadTools({ host });

    const tools = CapabilityRegistry.list();
    expect(tools.map((tool) => tool.id).sort()).toEqual([
      'upload_create_item',
      'upload_get_item',
      'upload_list_items',
      'upload_update_item',
    ]);
    expect(tools.find((tool) => tool.id === 'upload_create_item')?.requiresIdempotencyKey).toBe(
      true,
    );
    expect(tools.find((tool) => tool.id === 'upload_update_item')?.dangerClass).toBe(
      'state_changing',
    );
  });
});
