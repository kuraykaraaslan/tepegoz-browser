import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerTabTools, type TabHost } from './tab-tools';

function fakeHost(overrides?: Partial<TabHost>): TabHost {
  return {
    listTabs: () => [{ id: 't1', title: 'Tab', url: 'https://x' }],
    createTab: () => 'tab-1',
    ...overrides,
  };
}

describe('registerTabTools', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('registers the tab_* tools as always-on builtins', () => {
    registerTabTools({ host: fakeHost() });
    const ids = CapabilityRegistry.list()
      .map((d) => d.id)
      .sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(['tab_create_item', 'tab_list_items']);
    for (const d of CapabilityRegistry.list()) {
      expect(d.source).toBe('builtin');
    }
  });

  it('binds the injected host into a handler (tab_create_item → host.createTab)', () => {
    const createTab = vi.fn(() => 'tab-42');
    registerTabTools({ host: fakeHost({ createTab }) });
    const cap = CapabilityRegistry.get('tab_create_item');
    expect(cap).toBeDefined();
    const result = cap!.handler({ url: 'https://y', groupName: 'Task' });
    expect(createTab).toHaveBeenCalledWith('https://y', 'Task');
    expect(result).toEqual({ id: 'tab-42' });
  });
});
