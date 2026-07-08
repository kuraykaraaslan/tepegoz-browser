import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerBrowserTools } from './browser-tools';
import type { BrowserHost } from './host';

function fakeHost(overrides?: Partial<BrowserHost>): BrowserHost {
  return {
    navigate: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    readPage: () => Promise.resolve({ url: 'https://x', title: 'X', text: 'hello', sig: 's1' }),
    waitForLoad: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    snapshotElements: () => Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    clickElement: () => Promise.resolve(),
    fillElement: () => Promise.resolve(),
    pressKey: () => Promise.resolve(),
    scrollPage: () => Promise.resolve(),
    scrollToText: () => Promise.resolve({ found: true, count: 1 }),
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
      'browser_validate_page',
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
    expect(clickElement).toHaveBeenCalledWith(3, undefined);
    expect(result).toMatchObject({ ok: true, changed: false });
    expect((result as Record<string, unknown>).recoveryHint).toEqual(expect.any(String));
  });

  it('reports visible page changes after an interaction', async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'before', sig: 's1' })
      .mockResolvedValueOnce({ url: 'https://x/done', title: 'Done', text: 'after', sig: 's2' });
    const clickElement = vi.fn(() => Promise.resolve());
    registerBrowserTools({ host: fakeHost({ readPage, clickElement }) });

    const result = await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'click',
      ref: 3,
    });

    expect(result).toEqual({ ok: true, url: 'https://x/done', title: 'Done', changed: true });
  });

  it('reports a structural-only change (menu opened) as changed with a re-read note', async () => {
    // url/title/visible-text identical before and after — only the visible actionable set (sig) moved,
    // the drawer-menu case: the click really opened it, so this must NOT read as a no-op.
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'closed' })
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'open' });
    const clickElement = vi.fn(() => Promise.resolve());
    registerBrowserTools({ host: fakeHost({ readPage, clickElement }) });

    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'click',
      ref: 3,
    })) as Record<string, unknown>;

    expect(result.changed).toBe(true);
    expect(result.recoveryHint).toBeUndefined();
    expect(result.note).toEqual(expect.stringContaining('Re-read browser_get_elements'));
  });

  it('reports a scroll plainly — no false "menu opened" note, no "no change" hint', async () => {
    // sig is viewport-relative, so a scroll shifts the in-viewport actionable set even though url/title/
    // innerText are scroll-invariant. That must NOT surface as "a menu opened — do NOT repeat" (which would
    // block the normal scroll-again-to-reach-content pattern); a scroll's viewport move is reported plainly.
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'top' })
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'scrolled' });
    const scrollPage = vi.fn(() => Promise.resolve());
    registerBrowserTools({ host: fakeHost({ readPage, scrollPage }) });

    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'scroll',
      direction: 'down',
    })) as Record<string, unknown>;

    expect(result).toEqual({ ok: true, url: 'https://x', title: 'X', changed: true });
    expect(result.note).toBeUndefined();
    expect(result.recoveryHint).toBeUndefined();
  });

  it('scroll_to_text found: reveals the target, reports found + a re-read note', async () => {
    const scrollToText = vi.fn(() => Promise.resolve({ found: true, count: 2 }));
    // Revealing an off-screen target shifts the in-viewport set, so `changed` is true; the meaningful
    // signal is found=true, and the model is told to re-read to act on the now-visible controls.
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'before' })
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'same', sig: 'after' });
    registerBrowserTools({ host: fakeHost({ scrollToText, readPage }) });

    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'scroll_to_text',
      text: 'Pricing',
      nth: 2,
    })) as Record<string, unknown>;

    expect(scrollToText).toHaveBeenCalledWith('Pricing', 2, undefined);
    expect(result.found).toBe(true);
    expect(result.recoveryHint).toBeUndefined();
    expect(result.note).toEqual(expect.stringContaining('Re-read browser_get_elements'));
  });

  it('scroll_to_text miss: reports found=false with a different-words hint, not the generic ref hint', async () => {
    const scrollToText = vi.fn(() => Promise.resolve({ found: false, count: 0 }));
    registerBrowserTools({ host: fakeHost({ scrollToText }) });

    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'scroll_to_text',
      text: 'Nonexistent',
    })) as Record<string, unknown>;

    expect(scrollToText).toHaveBeenCalledWith('Nonexistent', undefined, undefined);
    expect(result.found).toBe(false);
    expect(result.note).toBeUndefined();
    expect(result.recoveryHint).toEqual(expect.stringContaining('No matching text'));
  });

  it('scroll_to_text shortfall: fewer matches than nth reports found + an honest "only N" note, not a miss', async () => {
    // The text IS on the page (2 occurrences) but the model asked for the 5th. Revealing the last real
    // occurrence is progress — reporting "no matching text" would wrongly steer it to rephrase.
    const scrollToText = vi.fn(() => Promise.resolve({ found: true, count: 2 }));
    registerBrowserTools({ host: fakeHost({ scrollToText }) });

    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'scroll_to_text',
      text: 'Add to cart',
      nth: 5,
    })) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.recoveryHint).toBeUndefined();
    expect(result.note).toEqual(expect.stringContaining('Found only 2 occurrence'));
  });

  it('passes tabId through read/snapshot/action tools', async () => {
    const readPage = vi.fn(() => Promise.resolve({ url: 'https://x', title: 'X', text: 'hello', sig: 's1' }));
    const snapshotElements = vi.fn(() => Promise.resolve({ url: 'https://x', title: 'X', elements: [] }));
    const fillElement = vi.fn(() => Promise.resolve());
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
