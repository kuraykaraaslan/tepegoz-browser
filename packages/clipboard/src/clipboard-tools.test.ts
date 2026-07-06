import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerClipboardTools, type ClipboardToolsHost } from './clipboard-tools';

describe('clipboard tools', () => {
  it('registers HITL-gated clipboard tools', () => {
    CapabilityRegistry.reset();
    const host: ClipboardToolsHost = {
      readText: () => 'hello',
      writeText: () => ({ ok: true }),
    };

    registerClipboardTools({ host });

    const tools = CapabilityRegistry.list();
    expect(tools.map((tool) => tool.id).sort()).toEqual([
      'clipboard_create_text',
      'clipboard_get_text',
    ]);
    expect(tools.every((tool) => tool.dangerClass === 'state_changing')).toBe(true);
    expect(tools.find((tool) => tool.id === 'clipboard_create_text')?.requiresIdempotencyKey).toBe(true);
  });
});
