import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerBrowserTools } from './browser-tools';
import type { BrowserHost } from './host';
import { fakeHost } from './browser-tools.test-helpers';

describe('registerBrowserTools — browser_update_page interactions', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('binds the injected host into a handler (browser_update_page click → host.clickElement)', async () => {
    const clickElement = vi.fn(() => Promise.resolve({ occludedBy: null }));
    registerBrowserTools({ host: fakeHost({ clickElement }) });
    const cap = CapabilityRegistry.get('browser_update_page');
    expect(cap).toBeDefined();
    const result = await cap!.handler({ action: 'click', ref: 3 });
    expect(clickElement).toHaveBeenCalledWith(3, undefined);
    expect(result).toMatchObject({ ok: true, changed: false });
    expect((result as Record<string, unknown>).recoveryHint).toEqual(expect.any(String));
  });

  it('select_option → host.selectOption and reports the chosen label', async () => {
    const selectOption = vi.fn(() =>
      Promise.resolve({ selected: 'Türkiye', options: ['Germany', 'Türkiye'] }),
    );
    registerBrowserTools({ host: fakeHost({ selectOption }) });
    const result = await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'select_option',
      ref: 4,
      value: 'Türkiye',
    });
    expect(selectOption).toHaveBeenCalledWith(4, 'Türkiye', undefined);
    expect(result).toMatchObject({ ok: true, note: 'Selected "Türkiye" in the dropdown.' });
  });

  it('select_option accepts a `text` alias for the option value', async () => {
    // (The handler runs post-validation; the gateway's z.coerce handles a string `ref` on the real path.)
    const selectOption = vi.fn(() =>
      Promise.resolve({ selected: 'Türkiye', options: ['Germany', 'Türkiye'] }),
    );
    registerBrowserTools({ host: fakeHost({ selectOption }) });
    const result = await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'select_option',
      ref: 4,
      text: 'Türkiye', // used `text` instead of `value`
    });
    expect(selectOption).toHaveBeenCalledWith(4, 'Türkiye', undefined);
    expect(result).toMatchObject({ ok: true, note: 'Selected "Türkiye" in the dropdown.' });
  });

  it('UpdatePageArgs coerces a string ref (weak-model shape) at validation', () => {
    const cap = (() => {
      registerBrowserTools({ host: fakeHost() });
      return CapabilityRegistry.get('browser_update_page')!;
    })();
    const parsed = cap.inputSchema.safeParse({
      action: 'select_option',
      ref: '4',
      value: 'Türkiye',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as { ref: number }).ref).toBe(4);
  });

  it('select_option with no option value → a clear recoveryHint (not a hard validation error)', async () => {
    const selectOption = vi.fn(() => Promise.resolve({ selected: null, options: [] }));
    registerBrowserTools({ host: fakeHost({ selectOption }) });
    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'select_option',
      ref: 4,
    })) as Record<string, unknown>;
    expect(selectOption).not.toHaveBeenCalled();
    expect(result.recoveryHint).toContain('value');
  });

  it('select_option miss → recoveryHint lists the available options', async () => {
    const selectOption = vi.fn(() =>
      Promise.resolve({ selected: null, options: ['Germany', 'Türkiye'] }),
    );
    registerBrowserTools({ host: fakeHost({ selectOption }) });
    const result = (await CapabilityRegistry.get('browser_update_page')!.handler({
      action: 'select_option',
      ref: 4,
      value: 'Atlantis',
    })) as Record<string, unknown>;
    expect(result.recoveryHint).toContain('Germany, Türkiye');
    expect(result.recoveryHint).toContain('Atlantis');
    expect(result.note).toBeUndefined();
  });

  it('reports visible page changes after an interaction', async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://x', title: 'X', text: 'before', sig: 's1' })
      .mockResolvedValueOnce({ url: 'https://x/done', title: 'Done', text: 'after', sig: 's2' });
    const clickElement = vi.fn(() => Promise.resolve({ occludedBy: null }));
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
    const clickElement = vi.fn(() => Promise.resolve({ occludedBy: null }));
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
});

describe('send_keys chords (S3 PR2)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  const interact = async (
    args: Record<string, unknown>,
    host: BrowserHost,
  ): Promise<Record<string, unknown>> => {
    registerBrowserTools({ host });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse(args);
    if (parsed?.success !== true) throw new Error('args rejected');
    return (await tool?.handler(parsed.data)) as Record<string, unknown>;
  };

  it('passes a chord string straight through to the host', async () => {
    const sendKeys = vi.fn(() => Promise.resolve({ sent: 2, unsupported: [] }));
    const result = await interact(
      { action: 'send_keys', keys: 'Ctrl+A Delete' },
      fakeHost({ sendKeys }),
    );
    expect(sendKeys).toHaveBeenCalledWith('Ctrl+A Delete', undefined);
    expect(result['unsupportedKeys']).toBeUndefined();
  });

  it('reports keystrokes that never landed instead of failing the step', async () => {
    const result = await interact(
      { action: 'send_keys', keys: 'Hyper+K' },
      fakeHost({ sendKeys: () => Promise.resolve({ sent: 0, unsupported: ['Hyper+K'] }) }),
    );
    expect(result['ok']).toBe(true);
    expect(result['unsupportedKeys']).toEqual(['Hyper+K']);
    expect(String(result['recoveryHint'])).toContain('could not be sent');
  });

  it('press degrades the same way — an unknown key no longer ends the step', async () => {
    const result = await interact(
      { action: 'press', key: 'F13' },
      fakeHost({ pressKey: () => Promise.resolve({ sent: 0, unsupported: ['F13'] }) }),
    );
    expect(result['ok']).toBe(true);
    expect(result['unsupportedKeys']).toEqual(['F13']);
  });

  it('bounds the chord string at the schema boundary', () => {
    registerBrowserTools({ host: fakeHost() });
    const tool = CapabilityRegistry.get('browser_update_page');
    expect(
      tool?.inputSchema.safeParse({ action: 'send_keys', keys: 'x'.repeat(500) }).success,
    ).toBe(false);
  });
});

describe('click-time occlusion re-check (S3 PR5)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('refuses the click and names the blocker instead of clicking through it', async () => {
    const clickElement = vi.fn(() =>
      Promise.resolve({ occludedBy: '<div role="dialog"> "We use cookies"' }),
    );
    registerBrowserTools({ host: fakeHost({ clickElement }) });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse({ action: 'click', ref: 3 });
    if (parsed?.success !== true) throw new Error('args rejected');
    const result = (await tool?.handler(parsed.data)) as Record<string, unknown>;
    expect(result['occludedBy']).toBe('<div role="dialog"> "We use cookies"');
    expect(result['changed']).toBe(false);
    expect(String(result['recoveryHint'])).toContain('was NOT sent');
    expect(String(result['recoveryHint'])).toContain('Dismiss or close');
  });

  it('says nothing about occlusion when the click went through', async () => {
    registerBrowserTools({ host: fakeHost() });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse({ action: 'click', ref: 1 });
    if (parsed?.success !== true) throw new Error('args rejected');
    const result = (await tool?.handler(parsed.data)) as Record<string, unknown>;
    expect(result['occludedBy']).toBeUndefined();
  });
});

describe('hover (S3 PR6)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  const hover = async (host: BrowserHost): Promise<Record<string, unknown>> => {
    registerBrowserTools({ host });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse({ action: 'hover', ref: 2 });
    if (parsed?.success !== true) throw new Error('args rejected');
    return (await tool?.handler(parsed.data)) as Record<string, unknown>;
  };

  it('moves the pointer over the ref', async () => {
    const hoverElement = vi.fn(() => Promise.resolve());
    await hover(fakeHost({ hoverElement }));
    expect(hoverElement).toHaveBeenCalledWith(2, undefined);
  });

  it('tells the model to re-read when hovering revealed something', async () => {
    let call = 0;
    const readPage = () => {
      call += 1;
      return Promise.resolve({
        url: 'https://x',
        title: 'X',
        text: 'hello',
        sig: call > 1 ? 's2' : 's1',
      });
    };
    const result = await hover(fakeHost({ readPage }));
    expect(result['changed']).toBe(true);
    expect(String(result['note'])).toContain('re-read');
  });

  it('suggests clicking instead when nothing is hover-driven, rather than reporting a failure', async () => {
    const result = await hover(fakeHost());
    expect(result['ok']).toBe(true);
    expect(result['changed']).toBe(false);
    expect(String(result['note'])).toContain('try clicking it instead');
  });
});

describe('drag (S3 PR6 spike)', () => {
  beforeEach(() => CapabilityRegistry.reset());

  const drag = async (host: BrowserHost): Promise<Record<string, unknown>> => {
    registerBrowserTools({ host });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse({ action: 'drag', ref: 2, targetRef: 5 });
    if (parsed?.success !== true) throw new Error('args rejected');
    return (await tool?.handler(parsed.data)) as Record<string, unknown>;
  };

  it('passes both refs through to the host', async () => {
    const dragElement = vi.fn(() => Promise.resolve({ mode: 'pointer' as const }));
    await drag(fakeHost({ dragElement }));
    expect(dragElement).toHaveBeenCalledWith(2, 5, undefined);
  });

  it('reports which drag mechanism ran, for both modes', async () => {
    const native = await drag(fakeHost({ dragElement: () => Promise.resolve({ mode: 'native' }) }));
    expect(native['dragMode']).toBe('native');
    CapabilityRegistry.reset();
    const pointer = await drag(
      fakeHost({ dragElement: () => Promise.resolve({ mode: 'pointer' }) }),
    );
    expect(pointer['dragMode']).toBe('pointer');
  });

  it('rejects args missing targetRef — a drag with only a source is not a valid call', () => {
    registerBrowserTools({ host: fakeHost() });
    const tool = CapabilityRegistry.get('browser_update_page');
    const parsed = tool?.inputSchema.safeParse({ action: 'drag', ref: 2 });
    expect(parsed?.success).toBe(false);
  });
});
