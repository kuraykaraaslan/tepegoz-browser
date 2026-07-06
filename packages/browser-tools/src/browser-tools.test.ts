import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerBrowserTools } from './browser-tools';
import type { BrowserHost } from './host';

function fakeHost(overrides?: Partial<BrowserHost>): BrowserHost {
  return {
    navigateActive: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    readActivePage: () => Promise.resolve({ url: 'https://x', title: 'X', text: 'hello' }),
    snapshotElements: () => Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    clickElement: () => Promise.resolve(),
    fillElement: () => Promise.resolve(),
    pressKey: () => Promise.resolve(),
    scrollPage: () => Promise.resolve(),
    ...overrides,
  };
}

describe('registerBrowserTools', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('registers the browser_* tools as always-on builtins', () => {
    registerBrowserTools({ host: fakeHost() });
    const ids = CapabilityRegistry.list()
      .map((d) => d.id)
      .sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual([
      'browser_get_elements',
      'browser_get_page',
      'browser_update_location',
      'browser_update_page',
    ]);
    for (const d of CapabilityRegistry.list()) {
      expect(d.source).toBe('builtin');
      expect(d.category).toBe('browser');
    }
  });

  it('binds the injected host into a handler (browser_update_page click → host.clickElement)', async () => {
    const clickElement = vi.fn(() => Promise.resolve());
    registerBrowserTools({ host: fakeHost({ clickElement }) });
    const cap = CapabilityRegistry.get('browser_update_page');
    expect(cap).toBeDefined();
    const result = await cap!.handler({ action: 'click', ref: 3 });
    expect(clickElement).toHaveBeenCalledWith(3);
    expect(result).toEqual({ ok: true });
  });
});
