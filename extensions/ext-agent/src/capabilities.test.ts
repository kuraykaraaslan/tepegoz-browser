import { describe, it, expect, vi } from 'vitest';
import { agentBuiltinCapabilities, type AgentToolHost } from './capabilities';

function fakeHost(overrides?: Partial<AgentToolHost>): AgentToolHost {
  return {
    navigateActive: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    readActivePage: () => Promise.resolve({ url: 'https://x', title: 'X', text: 'hello' }),
    listTabs: () => [{ id: 't1', title: 'Tab', url: 'https://x' }],
    createTab: () => 'tab-1',
    snapshotElements: () => Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    clickElement: () => Promise.resolve(),
    fillElement: () => Promise.resolve(),
    pressKey: () => Promise.resolve(),
    scrollPage: () => Promise.resolve(),
    recentEvents: () => [],
    ...overrides,
  };
}

describe('agentBuiltinCapabilities', () => {
  it('declares the agent browser/tab/journal tools under com.tepegoz.agent', () => {
    const set = agentBuiltinCapabilities();
    expect(set.extensionId).toBe('com.tepegoz.agent');
    expect(set.capabilities.map((c) => c.descriptor.id).sort((a, b) => a.localeCompare(b))).toEqual([
      'browser_get_elements',
      'browser_get_page',
      'browser_update_location',
      'browser_update_page',
      'journal_search_events',
      'tab_create_item',
      'tab_list_items',
    ]);
    // Every descriptor is stamped source=extension + provenance for attribution/audit.
    for (const cap of set.capabilities) {
      expect(cap.descriptor.source).toBe('extension');
      expect(cap.descriptor.provenance).toBe('com.tepegoz.agent');
    }
  });

  it('binds the injected host into a handler (tab_create_item → host.createTab)', () => {
    const createTab = vi.fn(() => 'tab-42');
    const host = fakeHost({ createTab });
    const set = agentBuiltinCapabilities();
    const createCap = set.capabilities.find((c) => c.descriptor.id === 'tab_create_item');
    expect(createCap).toBeDefined();
    const result = createCap!.handler({ url: 'https://y', groupName: 'Task' }, host);
    expect(createTab).toHaveBeenCalledWith('https://y', 'Task');
    expect(result).toEqual({ id: 'tab-42' });
  });

  it('journal_search_events defaults the limit to 20', () => {
    const recentEvents = vi.fn(() => []);
    const host = fakeHost({ recentEvents });
    const set = agentBuiltinCapabilities();
    const journalCap = set.capabilities.find((c) => c.descriptor.id === 'journal_search_events');
    journalCap!.handler({}, host);
    expect(recentEvents).toHaveBeenCalledWith(20, undefined);
  });
});
