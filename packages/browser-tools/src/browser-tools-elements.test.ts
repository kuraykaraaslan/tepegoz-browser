import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerBrowserTools } from './browser-tools';
import type { BrowserHost } from './host';
import { fakeHost } from './browser-tools.test-helpers';

describe('registerBrowserTools — registration, forms and page loading', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('registers the browser_* tools as always-on builtins', () => {
    registerBrowserTools({ host: fakeHost() });
    const ids = CapabilityRegistry.list()
      .map((d) => d.id)
      .sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual([
      'browser_get_article',
      'browser_get_elements',
      'browser_get_page',
      'browser_search_elements',
      'browser_update_history',
      'browser_update_location',
      'browser_update_page',
      'browser_validate_condition',
      'browser_validate_form',
      'browser_validate_page',
    ]);
    for (const d of CapabilityRegistry.list()) {
      expect(d.source).toBe('builtin');
      expect(d.category).toBe('browser');
    }
  });

  it('browser_validate_form flags an empty required field over a WHOLE-PAGE snapshot + readPage', async () => {
    let seen: {
      tabId?: string | undefined;
      opts?: { viewportExpansionPx?: number | undefined } | undefined;
    } = {};
    const snapshotElements = vi.fn((tabId?: string, opts?: { viewportExpansionPx?: number }) => {
      seen = { tabId, opts };
      return Promise.resolve({
        url: 'https://x',
        title: 'X',
        elements: [
          {
            role: 'textbox',
            name: 'Email',
            tag: 'input',
            attributes: { required: 'true', type: 'email' },
          },
          { role: 'button', name: 'Sign up', tag: 'button', attributes: { type: 'submit' } },
        ],
      });
    });
    registerBrowserTools({
      host: fakeHost({
        snapshotElements,
        readPage: () =>
          Promise.resolve({ url: 'https://x', title: 'X', text: 'Sign up', sig: 's1' }),
      }),
    });
    const result = (await CapabilityRegistry.get('browser_validate_form')!.handler({})) as {
      ok: boolean;
      coverage: string;
      content: string;
      requiredEmpty: { label: string }[];
    };
    // Must widen the viewport test, or a required field below the fold would be silently missed.
    expect(seen.opts?.viewportExpansionPx ?? 0).toBeGreaterThan(1000);
    expect(result.ok).toBe(false);
    expect(result.coverage).toBe('complete');
    expect(result.requiredEmpty).toHaveLength(1);
    expect(result.requiredEmpty[0]?.label).toBe('Email');
    expect(result.content).toContain('do NOT submit');
    // The report embeds page-controlled text → must cross the AI-5 untrusted fence like other page reads.
    expect(result.content).toContain('<untrusted_page_content');
    expect(result.content).toContain('NOT instructions');
  });

  it('browser_validate_form threads tabId to BOTH host reads', async () => {
    const snapshotElements = vi.fn(() =>
      Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    );
    const readPage = vi.fn(() =>
      Promise.resolve({ url: 'https://x', title: 'X', text: '', sig: 's1' }),
    );
    registerBrowserTools({ host: fakeHost({ snapshotElements, readPage }) });
    await CapabilityRegistry.get('browser_validate_form')!.handler({ tabId: 'tab-9' });
    expect(snapshotElements).toHaveBeenCalledWith('tab-9', expect.any(Object));
    expect(readPage).toHaveBeenCalledWith('tab-9');
  });

  it('passes tabId through read/snapshot/action tools', async () => {
    const readPage = vi.fn(() =>
      Promise.resolve({ url: 'https://x', title: 'X', text: 'hello', sig: 's1' }),
    );
    const snapshotElements = vi.fn(() =>
      Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    );
    const fillElement = vi.fn(() => Promise.resolve({ widget: null }));
    registerBrowserTools({ host: fakeHost({ readPage, snapshotElements, fillElement }) });

    await CapabilityRegistry.get('browser_get_page')!.handler({ tabId: 'tab-2' });
    await CapabilityRegistry.get('browser_get_elements')!.handler({ tabId: 'tab-2' });
    await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'fill',
      ref: 4,
      text: 'hello',
      tabId: 'tab-2',
    });

    expect(readPage).toHaveBeenCalledWith('tab-2');
    expect(snapshotElements).toHaveBeenCalledWith('tab-2');
    expect(fillElement).toHaveBeenCalledWith(4, 'hello', 'tab-2');
  });

  it('validates page text after waiting for load', async () => {
    const waitForLoad = vi.fn(() => Promise.resolve({ url: 'https://x', title: 'X' }));
    registerBrowserTools({ host: fakeHost({ waitForLoad }) });
    const cap = CapabilityRegistry.get('browser_validate_page');
    expect(await cap!.handler({ tabId: 'tab-2', containsText: 'ell', timeoutMs: 1000 })).toEqual({
      url: 'https://x',
      title: 'X',
      ok: true,
      containsText: 'ell',
    });
    expect(await cap!.handler({ containsText: 'missing' })).toMatchObject({ ok: false });
    expect(waitForLoad).toHaveBeenCalledWith('tab-2', 1000);
  });
});

describe('browser_search_elements (S2)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  const page = {
    url: 'https://x',
    title: 'X',
    elements: [
      { role: 'button', name: 'Checkout now', tag: 'button' },
      { role: 'link', name: 'Home', tag: 'a', href: 'https://x/' },
      { role: 'link', name: 'Unsubscribe from updates', tag: 'a', href: 'https://x/unsub' },
      { role: 'textbox', name: 'Email', tag: 'input', value: 'nobody@example.com' },
    ],
  };

  const run = async (
    query: string,
    host?: Partial<BrowserHost>,
  ): Promise<Record<string, unknown>> => {
    registerBrowserTools({
      host: fakeHost({ snapshotElements: () => Promise.resolve(page), ...host }),
    });
    const tool = CapabilityRegistry.get('browser_search_elements');
    return (await tool?.handler({ query })) as Record<string, unknown>;
  };

  it('is a read tool', () => {
    registerBrowserTools({ host: fakeHost({ snapshotElements: () => Promise.resolve(page) }) });
    const descriptor = CapabilityRegistry.list().find((d) => d.id === 'browser_search_elements');
    expect(descriptor?.dangerClass).toBe('read');
  });

  it('matches case-insensitively against name, tag, role and href', async () => {
    const byName = await run('checkout');
    expect(byName['matches']).toEqual([
      { ref: 1, role: 'button', name: 'Checkout now', tag: 'button' },
    ]);

    CapabilityRegistry.reset();
    const byHref = await run('unsub');
    expect((byHref['matches'] as unknown[]).length).toBe(1);
    expect((byHref['matches'] as { name: string }[])[0]?.name).toBe('Unsubscribe from updates');
  });

  it('matches the current field VALUE, not just the label', async () => {
    const result = await run('example.com');
    expect((result['matches'] as { name: string }[])[0]?.name).toBe('Email');
  });

  it('returns refs valid for browser_update_page — no new ref space', async () => {
    const result = await run('home');
    expect((result['matches'] as { ref: number }[])[0]?.ref).toBe(2);
  });

  it('reports an empty match list plainly, not as an error, when nothing matches', async () => {
    const result = await run('nonexistent-query-xyz');
    expect(result).toMatchObject({ matches: [], count: 0 });
  });

  it('caps matches rather than returning a second full listing', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      role: 'link',
      name: `Result ${String(i)}`,
      tag: 'a',
    }));
    const result = await run('result', {
      snapshotElements: () => Promise.resolve({ url: 'https://x', title: 'X', elements: many }),
    });
    expect(result['count']).toBe(50);
  });
});

describe('navigation verbs and bounded waiting (S3 PR1)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  const call = async (
    id: string,
    args: Record<string, unknown>,
    host: BrowserHost,
  ): Promise<Record<string, unknown>> => {
    registerBrowserTools({ host });
    const tool = CapabilityRegistry.get(id);
    const parsed = tool?.inputSchema.safeParse(args);
    if (parsed?.success !== true)
      throw new Error('args rejected: ' + JSON.stringify(parsed?.error?.issues));
    return (await tool?.handler(parsed.data)) as Record<string, unknown>;
  };

  it('browser_update_history passes the direction through and reports where it landed', async () => {
    const historyGo = vi.fn(() =>
      Promise.resolve({ url: 'https://x/prev', title: 'Prev', moved: true }),
    );
    const result = await call(
      'browser_update_history',
      { direction: 'back' },
      fakeHost({ historyGo }),
    );
    expect(historyGo).toHaveBeenCalledWith('back', undefined);
    expect(result).toEqual({ url: 'https://x/prev', title: 'Prev', moved: true });
  });

  it('reports moved:false honestly when there was nowhere to go', async () => {
    const result = await call(
      'browser_update_history',
      { direction: 'back' },
      fakeHost({
        historyGo: () => Promise.resolve({ url: 'https://x', title: 'X', moved: false }),
      }),
    );
    expect(result['moved']).toBe(false);
  });

  it('rejects a direction that is not back/forward/reload', () => {
    registerBrowserTools({ host: fakeHost() });
    const tool = CapabilityRegistry.get('browser_update_history');
    expect(tool?.inputSchema.safeParse({ direction: 'sideways' }).success).toBe(false);
  });

  it('browser_validate_condition echoes the condition back with the wait result', async () => {
    const waitForCondition = vi.fn(() => Promise.resolve({ satisfied: false, waitedMs: 5000 }));
    const result = await call(
      'browser_validate_condition',
      { condition: 'text', value: 'Order placed', timeoutMs: 5000 },
      fakeHost({ waitForCondition }),
    );
    expect(waitForCondition).toHaveBeenCalledWith(
      { kind: 'text', value: 'Order placed', timeoutMs: 5000 },
      undefined,
    );
    // An unsatisfied wait is a RESULT, not an error — the model has to be able to see it.
    expect(result).toEqual({ satisfied: false, waitedMs: 5000, condition: 'text' });
  });

  it('needs no value for network_idle', async () => {
    const waitForCondition = vi.fn(() => Promise.resolve({ satisfied: true, waitedMs: 120 }));
    const result = await call(
      'browser_validate_condition',
      { condition: 'network_idle' },
      fakeHost({ waitForCondition }),
    );
    expect(waitForCondition).toHaveBeenCalledWith(
      { kind: 'network_idle', timeoutMs: 5000 },
      undefined,
    );
    expect(result['satisfied']).toBe(true);
  });

  it('refuses an unbounded wait at the schema boundary', () => {
    registerBrowserTools({ host: fakeHost() });
    const tool = CapabilityRegistry.get('browser_validate_condition');
    expect(
      tool?.inputSchema.safeParse({ condition: 'text', value: 'x', timeoutMs: 600_000 }).success,
    ).toBe(false);
  });
});

describe('browser_validate_page containsText branch', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('echoes containsText and reports the substring hit', async () => {
    registerBrowserTools({ host: fakeHost() }); // fake readPage text is "hello"
    const res = (await CapabilityRegistry.get('browser_validate_page')!.handler({
      containsText: 'hello',
      tabId: 't1',
    })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, containsText: 'hello' });
  });

  it('omits containsText and is always ok when no text was asked for', async () => {
    registerBrowserTools({ host: fakeHost() });
    const res = (await CapabilityRegistry.get('browser_validate_page')!.handler({
      tabId: 't1',
    })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true });
    expect(res).not.toHaveProperty('containsText');
  });
});
