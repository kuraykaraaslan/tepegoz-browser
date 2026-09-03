import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `MacroCdp` — the CDP surface the macro recorder/player drives a page with. Pinned: `ensure` attaches
 * the debugger (409 when it can't); `resolveChain` resolves a CSS or XPath selector to a backendNodeId
 * with auto-wait and returns null on timeout; `centerOf` (via click/fill) 409s an invisible element;
 * click/fill/pressKey/scroll dispatch raw CDP input or route through the human adapter; `extract` reads
 * text or a named attribute off the resolved node; and `pressKey` 400s an unknown key.
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));
vi.mock('@tepegoz/human-input', () => ({ HumanInputAdapter: class {} }));

const toQuery = vi.hoisted(() => vi.fn(() => ({ method: 'css', query: '#el' })));
vi.mock('@tepegoz/ext-macros/cdp-selectors', () => ({
  toQuery,
  KEY_MAP: {
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
    a: { key: 'a', code: 'KeyA', keyCode: 65, text: 'a' },
  },
}));

const MacroCdp = (await import('./macro-cdp.electron')).default;

let resp: Record<string, unknown>;
let send: ReturnType<typeof vi.fn>;
let attached: boolean;
let attachThrows: boolean;
const wc = (): { debugger: Record<string, unknown> } => ({
  debugger: {
    isAttached: () => attached,
    attach: vi.fn(() => {
      if (attachThrows) throw new Error('devtools open');
    }),
    sendCommand: send,
  },
});
const calls = (cmd: string): unknown[] =>
  send.mock.calls.filter((c: unknown[]) => c[0] === cmd).map((c: unknown[]): unknown => c[1]);
const cast = <T>(v: unknown): T => v as T;

beforeEach(() => {
  vi.clearAllMocks();
  attached = true;
  attachThrows = false;
  resp = {
    'DOM.getDocument': { root: { nodeId: 1 } },
    'DOM.querySelector': { nodeId: 42 },
    'DOM.describeNode': { node: { backendNodeId: 99 } },
    'DOM.getBoxModel': { model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } },
    'DOM.resolveNode': { object: { objectId: 'obj-1' } },
    'Runtime.callFunctionOn': { result: { value: 'Hello world' } },
  };
  send = vi.fn((cmd: string) => Promise.resolve(resp[cmd] ?? {}));
  toQuery.mockReturnValue({ method: 'css', query: '#el' });
});

describe('resolveChain', () => {
  it('resolves a CSS selector to a backendNodeId', async () => {
    const id = await MacroCdp.resolveChain(cast(wc()), [{ css: '#el' }] as never);
    expect(id).toBe(99);
    expect(calls('DOM.querySelector')[0]).toMatchObject({ nodeId: 1, selector: '#el' });
  });

  it('resolves an XPath selector through performSearch', async () => {
    toQuery.mockReturnValue({ method: 'xpath', query: '//button' });
    resp['DOM.performSearch'] = { searchId: 's1', resultCount: 1 };
    resp['DOM.getSearchResults'] = { nodeIds: [7] };
    resp['DOM.describeNode'] = { node: { backendNodeId: 70 } };
    const id = await MacroCdp.resolveChain(cast(wc()), [{ xpath: '//button' }] as never);
    expect(id).toBe(70);
    expect(calls('DOM.discardSearchResults')).toHaveLength(1);
  });

  it('returns null when nothing resolves before the deadline', async () => {
    resp['DOM.querySelector'] = {};
    const id = await MacroCdp.resolveChain(cast(wc()), [{ css: '#nope' }] as never, 0);
    expect(id).toBeNull();
  });

  it('409s when the debugger cannot attach', async () => {
    attached = false;
    attachThrows = true;
    await expect(
      MacroCdp.resolveChain(cast(wc()), [{ css: '#el' }] as never),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('click', () => {
  it('dispatches move/press/release at the element centre', async () => {
    await MacroCdp.click(cast(wc()), 99);
    const mouse = calls('Input.dispatchMouseEvent');
    expect(mouse.map((m) => (m as { type: string }).type)).toEqual([
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
    ]);
    expect(mouse[0]).toMatchObject({ x: 5, y: 5 });
  });

  it('409s an element with no usable box', async () => {
    resp['DOM.getBoxModel'] = { model: { content: [] } };
    await expect(MacroCdp.click(cast(wc()), 99)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('routes through the human adapter when supplied', async () => {
    const adapter = { idle: vi.fn(() => Promise.resolve()), click: vi.fn(() => Promise.resolve()) };
    await MacroCdp.click(cast(wc()), 99, cast(adapter));
    expect(adapter.click).toHaveBeenCalledWith(5, 5);
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(0);
  });
});

describe('fill', () => {
  it('focuses, selects all, and inserts the text (raw CDP)', async () => {
    await MacroCdp.fill(cast(wc()), 99, 'hello');
    expect(calls('DOM.focus')[0]).toMatchObject({ backendNodeId: 99 });
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(2);
    expect(calls('Input.insertText')[0]).toEqual({ text: 'hello' });
  });
});

describe('extract', () => {
  it('reads the element text', async () => {
    expect(await MacroCdp.extract(cast(wc()), 99)).toBe('Hello world');
  });

  it('reads a named attribute when one is given', async () => {
    resp['Runtime.callFunctionOn'] = { result: { value: 'https://x' } };
    expect(await MacroCdp.extract(cast(wc()), 99, 'href')).toBe('https://x');
    expect(calls('Runtime.callFunctionOn')[0]).toMatchObject({ arguments: [{ value: 'href' }] });
  });

  it('returns an empty string when the node cannot be resolved', async () => {
    resp['DOM.resolveNode'] = {};
    expect(await MacroCdp.extract(cast(wc()), 99)).toBe('');
  });
});

describe('pressKey', () => {
  it('dispatches rawKeyDown + keyUp for a mapped key', async () => {
    await MacroCdp.pressKey(cast(wc()), 'Enter');
    const ev = calls('Input.dispatchKeyEvent');
    expect(ev.map((e) => (e as { type: string }).type)).toEqual(['rawKeyDown', 'keyUp']);
    expect(ev[0]).toMatchObject({ code: 'Enter' });
  });

  it('400s an unsupported key', async () => {
    await expect(MacroCdp.pressKey(cast(wc()), 'Meta+Shift+K')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('scroll', () => {
  it('signs the wheel delta by direction and honours an explicit amount', async () => {
    await MacroCdp.scroll(cast(wc()), 'down');
    expect(calls('Input.dispatchMouseEvent')[0]).toMatchObject({ type: 'mouseWheel', deltaY: 600 });

    send.mockClear();
    await MacroCdp.scroll(cast(wc()), 'up', 150);
    expect(calls('Input.dispatchMouseEvent')[0]).toMatchObject({ deltaY: -150 });
  });

  it('routes through the adapter when supplied', async () => {
    const adapter = {
      idle: vi.fn(() => Promise.resolve()),
      scroll: vi.fn(() => Promise.resolve()),
    };
    await MacroCdp.scroll(cast(wc()), 'down', 300, cast(adapter));
    expect(adapter.scroll).toHaveBeenCalledWith('down', 300);
  });
});

describe('highlight', () => {
  it('enables the overlay and highlights the node, then hides it', async () => {
    await MacroCdp.highlight(cast(wc()), 99);
    expect(calls('Overlay.highlightNode')[0]).toMatchObject({ backendNodeId: 99 });
    await MacroCdp.hideHighlight(cast(wc()));
    expect(calls('Overlay.hideHighlight')).toHaveLength(1);
  });
});

describe('auto-wait poll + adapter routing', () => {
  it('resolveChain keeps polling until the element shows up', async () => {
    let queries = 0;
    send = vi.fn((cmd: string) => {
      if (cmd === 'DOM.querySelector') {
        queries += 1;
        return Promise.resolve(queries === 1 ? {} : { nodeId: 42 });
      }
      return Promise.resolve(resp[cmd] ?? {});
    });
    const id = await MacroCdp.resolveChain(cast(wc()), [{ css: '#el' }] as never, 5_000);
    expect(id).toBe(99);
    expect(queries).toBeGreaterThanOrEqual(2); // it retried after the first empty result
  });

  it('fill through the adapter uses a real click + Ctrl+A + typed text, never DOM.focus', async () => {
    const adapter = {
      idle: vi.fn(() => Promise.resolve()),
      click: vi.fn(() => Promise.resolve()),
      pressKey: vi.fn(() => Promise.resolve()),
      insertText: vi.fn(() => Promise.resolve()),
    };
    await MacroCdp.fill(cast(wc()), 99, 'typed', cast(adapter));
    expect(adapter.click).toHaveBeenCalled();
    expect(adapter.pressKey).toHaveBeenCalledWith({ key: 'a', code: 'KeyA', keyCode: 65 }, 2);
    expect(adapter.insertText).toHaveBeenCalledWith('typed');
    expect(calls('DOM.focus')).toHaveLength(0);
  });

  it('pressKey emits keyDown+text for a printable mapped key', async () => {
    await MacroCdp.pressKey(cast(wc()), 'a');
    const ev = calls('Input.dispatchKeyEvent') as { type: string; text?: string }[];
    expect(ev[0]).toMatchObject({ type: 'keyDown', text: 'a' });
    expect(ev[1]).toMatchObject({ type: 'keyUp' });
  });

  it('pressKey routes through the adapter when one is supplied', async () => {
    const adapter = {
      idle: vi.fn(() => Promise.resolve()),
      pressKey: vi.fn(() => Promise.resolve()),
    };
    await MacroCdp.pressKey(cast(wc()), 'Enter', cast(adapter));
    expect(adapter.pressKey).toHaveBeenCalledWith({ key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(0);
  });
});
