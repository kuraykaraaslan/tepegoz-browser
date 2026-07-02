import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import {
  registerBuiltinTools,
  resetBuiltinToolsForTest,
  type BrowserHost,
  type JournalReader,
} from './builtin-tools';

const host: BrowserHost = {
  navigateActive: (url) => Promise.resolve({ url, title: 'T' }),
  readActivePage: () => Promise.resolve({ url: 'https://a.test', title: 'A', text: 'hello' }),
  listTabs: () => [{ id: '1', title: 'A', url: 'https://a.test' }],
  createTab: (url) => `tab-${url ?? 'blank'}`,
};

describe('registerBuiltinTools', () => {
  beforeEach(() => {
    CapabilityRegistry.reset();
    resetBuiltinToolsForTest();
  });

  it('registers the browser/tab tools, skipping journal when no reader is injected', () => {
    registerBuiltinTools(host);
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids).toContain('browser_get_page');
    expect(ids).toContain('browser_update_location');
    expect(ids).toContain('tab_list_items');
    expect(ids).toContain('tab_create_item');
    expect(ids).not.toContain('journal_search_events');
  });

  it('registers journal_search_events when a JournalReader is injected', () => {
    let received: { limit: number; correlationId: string | undefined } | null = null;
    const journal: JournalReader = {
      recentEvents: (limit, correlationId) => {
        received = { limit, correlationId };
        return [
          { type: 'TaskSucceeded', ts: 1, actor: 'agent', correlationId: 'run-1', summary: 'ok' },
        ];
      },
    };
    registerBuiltinTools(host, journal);

    const tool = CapabilityRegistry.get('journal_search_events');
    expect(tool).toBeDefined();
    expect(tool?.descriptor.dangerClass).toBe('read');

    // Default limit is applied when the arg is omitted.
    tool?.handler({});
    expect(received).toEqual({ limit: 20, correlationId: undefined });

    tool?.handler({ limit: 5, correlationId: 'run-1' });
    expect(received).toEqual({ limit: 5, correlationId: 'run-1' });
  });

  it('rejects an oversized or non-integer limit at the tool boundary', () => {
    const journal: JournalReader = { recentEvents: () => [] };
    registerBuiltinTools(host, journal);
    const schema = CapabilityRegistry.get('journal_search_events')?.inputSchema;
    expect(schema?.safeParse({ limit: 500 }).success).toBe(false);
    expect(schema?.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(schema?.safeParse({ limit: 20 }).success).toBe(true);
  });
});
