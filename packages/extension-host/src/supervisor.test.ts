import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { capability, defineCapabilities } from '@tepegoz/extension-sdk';
import type { RegisteredTool } from '@tepegoz/capability-plane';
import { ExtensionCapabilitySupervisor } from './supervisor';
import { extensionManagementCapabilities } from './meta';
import type { CapabilityRegistryPort, ExtensionInfo, ExtensionManagementHost } from './types';

/** An in-memory CapabilityRegistry stand-in. */
function fakeRegistry(): CapabilityRegistryPort & {
  ids: () => string[];
  call: (id: string, a: unknown) => unknown;
} {
  const map = new Map<string, RegisteredTool>();
  return {
    register: (t) => {
      if (map.has(t.descriptor.id)) throw new Error(`dup ${t.descriptor.id}`);
      map.set(t.descriptor.id, t);
    },
    unregister: (id) => map.delete(id),
    has: (id) => map.has(id),
    ids: () => [...map.keys()],
    call: (id, a) => map.get(id)?.handler(a),
  };
}

const demoSet = (id = 'com.tepegoz.demo') =>
  defineCapabilities(id, [
    capability<{ n: number }, { double: (n: number) => number }>({
      id: 'demo_get_double',
      description: 'double n. args: { n }',
      dangerClass: 'read',
      inputSchema: z.object({ n: z.number() }),
      handler: (args, host) => host.double(args.n),
    }),
  ]);

describe('defineCapabilities', () => {
  it('stamps source=extension + provenance and enforces the tool-name rule', () => {
    const cap = demoSet().capabilities[0];
    expect(cap?.descriptor.source).toBe('extension');
    expect(cap?.descriptor.provenance).toBe('com.tepegoz.demo');
  });

  it('rejects a non-conformant tool id', () => {
    expect(() =>
      capability({
        id: 'BadName',
        description: 'x',
        dangerClass: 'read',
        inputSchema: z.object({}),
        handler: () => null,
      }),
    ).toThrow();
  });

  it('rejects an invalid extension id', () => {
    expect(() => defineCapabilities('nodots', [])).toThrow();
  });
});

describe('ExtensionCapabilitySupervisor', () => {
  it('registers only enabled providers and unregisters on disable', () => {
    const registry = fakeRegistry();
    let enabled = false;
    const sup = new ExtensionCapabilitySupervisor({ registry, isEnabled: () => enabled });
    sup.provide(demoSet(), { double: (n) => n * 2 });

    sup.reconcile();
    expect(registry.ids()).toEqual([]); // disabled → nothing registered

    enabled = true;
    sup.reconcile();
    expect(registry.ids()).toEqual(['demo_get_double']);
    expect(sup.registeredIds()).toEqual(['demo_get_double']);
    expect(registry.call('demo_get_double', { n: 21 })).toBe(42); // host bound into handler

    enabled = false;
    sup.reconcile();
    expect(registry.ids()).toEqual([]); // disable → unregistered
  });

  it('does not clobber a same-id tool already registered by another source', () => {
    const registry = fakeRegistry();
    registry.register({
      descriptor: {
        id: 'demo_get_double',
        description: 'x',
        dangerClass: 'read',
        source: 'builtin',
        inputSchema: {},
        requiresIdempotencyKey: false,
      },
      inputSchema: z.object({}),
      handler: () => 'builtin',
    });
    const sup = new ExtensionCapabilitySupervisor({ registry, isEnabled: () => true });
    sup.provide(demoSet(), { double: (n) => n * 2 });
    sup.reconcile();
    expect(sup.registeredIds()).toEqual([]); // skipped — id already taken
    expect(registry.call('demo_get_double', {})).toBe('builtin');
  });
});

describe('extensionManagementCapabilities', () => {
  it('exposes list/get/update bound to the management host', () => {
    const info: ExtensionInfo = {
      id: 'com.tepegoz.macros',
      name: 'Macros',
      version: '0.1.0',
      enabled: true,
      permissions: ['tabs'],
      capabilities: ['macros_list_items'],
    };
    const setEnabled = vi.fn((_id: string, en: boolean): ExtensionInfo => ({
      ...info,
      enabled: en,
    }));
    const host: ExtensionManagementHost = {
      list: () => [info],
      get: (id) => (id === info.id ? info : undefined),
      setEnabled,
    };
    const registry = fakeRegistry();
    const sup = new ExtensionCapabilitySupervisor({ registry, isEnabled: () => true });
    sup.provide(extensionManagementCapabilities(), host);
    sup.reconcile();

    expect([...registry.ids()].sort((a, b) => a.localeCompare(b))).toEqual([
      'extension_get_item',
      'extension_list_items',
      'extension_update_item',
    ]);
    expect(registry.call('extension_list_items', {})).toEqual([info]);
    expect(registry.call('extension_get_item', { id: 'com.tepegoz.macros' })).toEqual(info);
    expect(
      registry.call('extension_update_item', { id: 'com.tepegoz.macros', enabled: false }),
    ).toEqual({ ...info, enabled: false });
    expect(setEnabled).toHaveBeenCalledWith('com.tepegoz.macros', false);
  });
});
