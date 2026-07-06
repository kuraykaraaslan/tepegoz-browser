import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerTabTools, type TabHost } from './tab-tools';

function fakeHost(overrides?: Partial<TabHost>): TabHost {
  return {
    listTabs: () => [{ id: 't1', title: 'Tab', url: 'https://x', active: true }],
    createTab: () => 'tab-1',
    activateTab: () => true,
    closeTab: () => true,
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
    expect(ids).toEqual([
      'tab_create_item',
      'tab_delete_item',
      'tab_get_item',
      'tab_list_items',
      'tab_update_item',
    ]);
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
    expect(createTab).toHaveBeenCalledWith('https://y', 'Task', true);
    expect(result).toEqual({ id: 'tab-42', active: false });
  });

  it('supports foreground tab creation when requested', () => {
    const createTab = vi.fn(() => 'tab-43');
    registerTabTools({ host: fakeHost({ createTab }) });
    const cap = CapabilityRegistry.get('tab_create_item');
    const result = cap!.handler({ url: 'https://y', background: false });
    expect(createTab).toHaveBeenCalledWith('https://y', undefined, false);
    expect(result).toEqual({ id: 'tab-43', active: true });
  });

  it('gets a single tab by id from the list', () => {
    registerTabTools({ host: fakeHost() });
    expect(CapabilityRegistry.get('tab_get_item')!.handler({ id: 't1' })).toEqual({
      id: 't1',
      title: 'Tab',
      url: 'https://x',
      active: true,
    });
    expect(CapabilityRegistry.get('tab_get_item')!.handler({ id: 'missing' })).toBeNull();
  });

  it('binds tab_update_item to host.activateTab', () => {
    const activateTab = vi.fn(() => true);
    registerTabTools({ host: fakeHost({ activateTab }) });
    const result = CapabilityRegistry.get('tab_update_item')!.handler({ id: 't1' });
    expect(activateTab).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ id: 't1', active: true });
  });

  it('binds tab_delete_item to host.closeTab', () => {
    const closeTab = vi.fn(() => true);
    registerTabTools({ host: fakeHost({ closeTab }) });
    const result = CapabilityRegistry.get('tab_delete_item')!.handler({ id: 't1' });
    expect(closeTab).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ id: 't1', closed: true });
  });
});
