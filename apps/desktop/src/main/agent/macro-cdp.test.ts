import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebContents } from 'electron';
import { HumanInputAdapter } from '@tepegoz/human-input';
import MacroCdp from './macro-cdp.electron';

interface Recorded {
  method: string;
  params: Record<string, unknown>;
}

/**
 * One recorder plays two roles: it backs both `wc.debugger.sendCommand` (box model, focus probe) and
 * the adapter's CDP `send` (mouse/key/insertText), so a single `calls` log captures the whole fill.
 * Canned responses satisfy `centerOf` (valid box) and `isFocused` (activeElement === target).
 */
function makeHarness(): { wc: WebContents; adapter: HumanInputAdapter; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const sendCommand = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    calls.push({ method, params });
    if (method === 'DOM.getBoxModel') {
      return Promise.resolve({ model: { content: [10, 10, 30, 10, 30, 30, 10, 30] } });
    }
    if (method === 'DOM.resolveNode') return Promise.resolve({ object: { objectId: 'obj-1' } });
    if (method === 'Runtime.callFunctionOn') return Promise.resolve({ result: { value: true } });
    return Promise.resolve({});
  };
  const wc = { debugger: { isAttached: () => true, sendCommand } } as unknown as WebContents;
  const adapter = new HumanInputAdapter(sendCommand);
  return { wc, adapter, calls };
}

const has = (calls: Recorded[], method: string, pred?: (p: Record<string, unknown>) => boolean): boolean =>
  calls.some((c) => c.method === method && (pred === undefined || pred(c.params)));

describe('MacroCdp.fill — human (adapter) path', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('activates the field with a real click, never DOM.focus, then Ctrl+A and per-char typing', async () => {
    const { wc, adapter, calls } = makeHarness();

    const done = MacroCdp.fill(wc, 1, 'hi', adapter);
    await vi.runAllTimersAsync();
    await done;

    // Focus comes from a trusted click — press + release, no programmatic focus.
    expect(has(calls, 'Input.dispatchMouseEvent', (p) => p.type === 'mousePressed')).toBe(true);
    expect(has(calls, 'Input.dispatchMouseEvent', (p) => p.type === 'mouseReleased')).toBe(true);
    expect(has(calls, 'DOM.focus')).toBe(false);

    // Select-all is the Ctrl (modifiers:2) accelerator on KeyA, and it must not type the letter 'a'.
    expect(has(calls, 'Input.dispatchKeyEvent', (p) => p.modifiers === 2 && p.code === 'KeyA')).toBe(true);
    expect(has(calls, 'Input.dispatchKeyEvent', (p) => p.code === 'KeyA' && typeof p.text === 'string')).toBe(false);

    // Typing is per-character (no paste-shaped single insert).
    const inserts = calls.filter((c) => c.method === 'Input.insertText');
    expect(inserts).toHaveLength('hi'.length);
    expect(inserts.every((c) => (c.params.text as string).length === 1)).toBe(true);
  });
});

describe('MacroCdp.fill — background (no-adapter) fallback', () => {
  it('keeps the programmatic DOM.focus path and never synthesizes a click', async () => {
    const { wc, calls } = makeHarness();

    await MacroCdp.fill(wc, 1, 'hi');

    expect(has(calls, 'DOM.focus')).toBe(true);
    expect(has(calls, 'Input.dispatchMouseEvent', (p) => p.type === 'mousePressed')).toBe(false);
    // The fallback inserts the whole string in one shot.
    const inserts = calls.filter((c) => c.method === 'Input.insertText');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.params.text).toBe('hi');
  });
});
