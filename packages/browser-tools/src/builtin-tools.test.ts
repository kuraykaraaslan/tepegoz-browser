import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import {
  registerBuiltinTools,
  resetBuiltinToolsForTest,
  type BrowserHost,
  type JournalReader,
} from './builtin-tools';

/** Records the action calls so the tests can assert dispatch through the tool boundary. */
const actions: string[] = [];
const host: BrowserHost = {
  navigateActive: (url) => Promise.resolve({ url, title: 'T' }),
  readActivePage: () => Promise.resolve({ url: 'https://a.test', title: 'A', text: 'hello' }),
  listTabs: () => [{ id: '1', title: 'A', url: 'https://a.test' }],
  createTab: (url) => `tab-${url ?? 'blank'}`,
  snapshotElements: () =>
    Promise.resolve({
      url: 'https://a.test',
      title: 'A',
      elements: [
        { role: 'textbox', name: 'Email' },
        { role: 'button', name: 'Login' },
      ],
    }),
  clickElement: (ref) => {
    actions.push(`click:${String(ref)}`);
    return Promise.resolve();
  },
  fillElement: (ref, text) => {
    actions.push(`fill:${String(ref)}:${text}`);
    return Promise.resolve();
  },
  pressKey: (key) => {
    actions.push(`press:${key}`);
    return Promise.resolve();
  },
  scrollPage: (direction, amount) => {
    actions.push(`scroll:${direction}:${String(amount)}`);
    return Promise.resolve();
  },
};

describe('registerBuiltinTools', () => {
  beforeEach(() => {
    CapabilityRegistry.reset();
    resetBuiltinToolsForTest();
    actions.length = 0;
  });

  it('registers the browser/tab tools, skipping journal when no reader is injected', () => {
    registerBuiltinTools(host);
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids).toContain('browser_get_page');
    expect(ids).toContain('browser_update_location');
    expect(ids).toContain('browser_get_elements');
    expect(ids).toContain('browser_update_page');
    expect(ids).toContain('tab_list_items');
    expect(ids).toContain('tab_create_item');
    expect(ids).not.toContain('journal_search_events');
  });

  it('browser_get_elements returns a sanitized, ref-indexed actionable snapshot', async () => {
    registerBuiltinTools(host);
    const tool = CapabilityRegistry.get('browser_get_elements');
    expect(tool?.descriptor.dangerClass).toBe('read');
    const snap = (await tool?.handler({})) as {
      elements: { ref: number; role: string; name: string }[];
      content: string;
    };
    expect(snap.elements.map((e) => e.ref)).toEqual([1, 2]);
    expect(snap.elements[1]?.name).toBe('Login');
    // The listing is wrapped as untrusted content (taint source for the runtime).
    expect(snap.content).toContain('untrusted_page_content');
  });

  it('browser_update_page dispatches each action variant to the host', async () => {
    registerBuiltinTools(host);
    const tool = CapabilityRegistry.get('browser_update_page');
    expect(tool?.descriptor.dangerClass).toBe('state_changing');
    await tool?.handler({ action: 'click', ref: 2 });
    await tool?.handler({ action: 'fill', ref: 1, text: 'a@b.com' });
    await tool?.handler({ action: 'press', key: 'Enter' });
    await tool?.handler({ action: 'scroll', direction: 'down' });
    expect(actions).toEqual(['click:2', 'fill:1:a@b.com', 'press:Enter', 'scroll:down:undefined']);
  });

  it('browser_update_page rejects malformed action args at the tool boundary', () => {
    registerBuiltinTools(host);
    const schema = CapabilityRegistry.get('browser_update_page')?.inputSchema;
    expect(schema?.safeParse({ action: 'click' }).success).toBe(false); // missing ref
    expect(schema?.safeParse({ action: 'fill', ref: 1 }).success).toBe(false); // missing text
    expect(schema?.safeParse({ action: 'bogus' }).success).toBe(false);
    expect(schema?.safeParse({ action: 'click', ref: 3 }).success).toBe(true);
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
