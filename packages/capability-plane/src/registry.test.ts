import { describe, it, expect, beforeEach } from 'vitest';
import type { RiskLevel } from '@tepegoz/shared-types';
import CapabilityRegistry from './registry';
import type { InputValidator } from './types';

/**
 * Accepts any OBJECT — and rejects anything that is not one, which is what every real tool schema does.
 * It used to return `success: true` unconditionally, coercing a non-object to `{}`. That is a rubber
 * stamp, not a validator, and `CapabilityRegistry.register` now refuses one: a tool whose validator says
 * yes to everything sends LLM-produced arguments straight into its handler.
 */
const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) =>
    typeof d === 'object' && d !== null && !Array.isArray(d)
      ? { success: true, data: d as Record<string, unknown> }
      : { success: false, error: { issues: ['expected an object'] } },
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

describe('CapabilityRegistry refuses a tool that cannot validate its own input', () => {
  const descriptor = {
    id: 'test_get_thing',
    description: 'test tool',
    dangerClass: 'read' as RiskLevel,
    source: 'mcp' as const,
    inputSchema: {},
    requiresIdempotencyKey: false,
  };

  it('rejects a missing validator', () => {
    expect(() =>
      CapabilityRegistry.register({
        descriptor,
        inputSchema: undefined as unknown as InputValidator<unknown>,
        handler: () => 'ok',
      }),
    ).toThrow(/input validator/i);
  });

  it('rejects a validator that accepts anything', () => {
    // The realistic shape of the mistake: a stub written to "just let it through" during development,
    // which then ships. It succeeds on every input, so nothing downstream ever notices.
    expect(() =>
      CapabilityRegistry.register({
        descriptor,
        inputSchema: { safeParse: (data: unknown) => ({ success: true as const, data }) },
        handler: () => 'ok',
      }),
    ).toThrow(/accepts anything/i);
  });

  it('rejects a missing handler', () => {
    expect(() =>
      CapabilityRegistry.register({
        descriptor,
        inputSchema: passAny,
        handler: undefined as unknown as () => unknown,
      }),
    ).toThrow(/handler/i);
  });

  it('accepts a real object schema, and none of the above left the tool registered', () => {
    expect(CapabilityRegistry.get('test_get_thing')).toBeUndefined();
    CapabilityRegistry.register({ descriptor, inputSchema: passAny, handler: () => 'ok' });
    expect(CapabilityRegistry.get('test_get_thing')).toBeDefined();
  });

  it('does not mistake a strict validator that THROWS for a permissive one', () => {
    expect(() =>
      CapabilityRegistry.register({
        descriptor: { ...descriptor, id: 'test_get_thrower' },
        inputSchema: {
          safeParse: () => {
            throw new Error('validator blew up');
          },
        },
        handler: () => 'ok',
      }),
    ).not.toThrow();
  });
});
