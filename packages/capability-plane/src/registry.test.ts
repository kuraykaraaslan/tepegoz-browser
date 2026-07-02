import { describe, it, expect, beforeEach } from 'vitest';
import type { RiskLevel } from '@tepegoz/shared-types';
import CapabilityRegistry from './registry';
import type { InputValidator } from './types';

const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) => ({
    success: true,
    data: (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>,
  }),
};

function register(id: string, dangerClass: RiskLevel = 'read'): void {
  CapabilityRegistry.register({
    descriptor: {
      id,
      description: 'test tool',
      dangerClass,
      source: 'mcp',
      inputSchema: {},
      requiresIdempotencyKey: false,
    },
    inputSchema: passAny,
    handler: () => 'ok',
  });
}

beforeEach(() => {
  CapabilityRegistry.reset();
});

describe('CapabilityRegistry', () => {
  it('enforces {domain}_{verb}_{noun} naming at registration', () => {
    expect(() => register('browser_get_page')).not.toThrow();
    expect(() => register('read_file')).toThrow(); // unapproved verb
  });

  it('rejects a duplicate id with a 409', () => {
    register('tab_list_items');
    expect(() => register('tab_list_items')).toThrow();
  });

  describe('unregister', () => {
    it('removes a registered tool so get() returns undefined and list() drops it', () => {
      register('mcpfilesystem_get_file');
      expect(CapabilityRegistry.get('mcpfilesystem_get_file')).toBeDefined();
      expect(CapabilityRegistry.unregister('mcpfilesystem_get_file')).toBe(true);
      expect(CapabilityRegistry.get('mcpfilesystem_get_file')).toBeUndefined();
      expect(CapabilityRegistry.list().map((d) => d.id)).not.toContain('mcpfilesystem_get_file');
    });

    it('returns false for an unknown id (idempotent)', () => {
      expect(CapabilityRegistry.unregister('mcpx_get_nothing')).toBe(false);
    });

    it('allows re-registering the same id after unregister (no 409)', () => {
      register('mcpslack_create_message');
      CapabilityRegistry.unregister('mcpslack_create_message');
      expect(() => register('mcpslack_create_message')).not.toThrow();
    });
  });
});
