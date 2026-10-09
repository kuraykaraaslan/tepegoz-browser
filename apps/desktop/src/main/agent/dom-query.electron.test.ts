import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { queryElements } from './dom-query.electron';
import type { RefTarget } from './cdp-driver-schemas.electron';

/**
 * Locks the contract `browser_search_nodes` depends on: no CDP call anywhere (only
 * `executeJavaScriptInIsolatedWorld`), a malformed/unexpected page result degrading to a clean ok:false
 * rather than being trusted or throwing, and — the trickiest part of this tool — the ref-resolution
 * contract: an already-tracked match keeps ITS ref, an untracked match gets a freshly minted ref written
 * into the SAME per-tab `refMaps` a snapshot populates, and a match with no computable path gets
 * `ref: null` rather than a fabricated number.
 */

function fakeWebContents(opts: { destroyed?: boolean; result?: unknown; reject?: Error } = {}): {
  wc: WebContents;
  calls: unknown[][];
  debuggerSendCommand: ReturnType<typeof vi.fn>;
} {
  const calls: unknown[][] = [];
  const debuggerSendCommand = vi.fn(() => Promise.reject(new Error('CDP must not be used here')));
  const wc = {
    isDestroyed: () => opts.destroyed ?? false,
    executeJavaScriptInIsolatedWorld: (worldId: number, scripts: unknown[]) => {
      calls.push([worldId, scripts]);
      if (opts.reject !== undefined) return Promise.reject(opts.reject);
      return Promise.resolve(opts.result);
    },
    debugger: { sendCommand: debuggerSendCommand },
  } as unknown as WebContents;
  return { wc, calls, debuggerSendCommand };
}

const okResult = (matches: unknown[], total?: number): unknown => ({
  ok: true,
  total: total ?? matches.length,
  matches,
});

describe('queryElements (S2/PR7 P3-a)', () => {
  it('resolves matches via executeJavaScriptInIsolatedWorld, never wc.debugger', async () => {
    const { wc, calls, debuggerSendCommand } = fakeWebContents({
      result: okResult([{ tag: 'div', attributes: { id: 'a' }, existingRef: null, path: [[0]] }]),
    });
    const probe = await queryElements(wc, 'div', 'css', new WeakMap());
    expect(probe.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(debuggerSendCommand).not.toHaveBeenCalled();
  });

  it('a destroyed tab returns ok:false without touching the page', async () => {
    const { wc, calls } = fakeWebContents({ destroyed: true });
    const probe = await queryElements(wc, 'div', 'css', new WeakMap());
    expect(probe).toMatchObject({ ok: false, total: 0, matches: [] });
    expect(calls).toHaveLength(0);
  });

  it('never throws when the isolated-world read rejects', async () => {
    const { wc } = fakeWebContents({ reject: new Error('frame gone') });
    await expect(queryElements(wc, 'div', 'css', new WeakMap())).resolves.toMatchObject({
      ok: false,
    });
  });

  it('a malformed page result degrades to ok:false rather than being trusted', async () => {
    const { wc } = fakeWebContents({ result: { ok: true, total: 'not-a-number' } });
    const probe = await queryElements(wc, 'div', 'css', new WeakMap());
    expect(probe.ok).toBe(false);
  });

  it('propagates the script-reported error for a malformed selector/XPath', async () => {
    const { wc } = fakeWebContents({ result: { ok: false, error: 'not a valid selector' } });
    const probe = await queryElements(wc, '[[[', 'css', new WeakMap());
    expect(probe).toMatchObject({ ok: false, error: 'not a valid selector' });
  });

  it('reuses an EXISTING ref as-is when the script reports one (existingRef), never re-minting it', async () => {
    const refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
    const { wc } = fakeWebContents({
      result: okResult([{ tag: 'a', attributes: {}, existingRef: 5, path: null }]),
    });
    refMaps.set(wc, new Map([[5, { path: [[0]] }]]));
    const probe = await queryElements(wc, 'a', 'css', refMaps);
    expect(probe.matches).toEqual([{ tag: 'a', attributes: {}, ref: 5 }]);
    // The map still has exactly the one entry — nothing new was minted for an already-tracked element.
    expect(refMaps.get(wc)?.size).toBe(1);
  });

  it('mints a FRESH ref (one past the highest existing ref) for an untracked match, and writes it into refMaps', async () => {
    const refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
    const { wc } = fakeWebContents({
      result: okResult([
        { tag: 'div', attributes: { id: 'new' }, existingRef: null, path: [[2, 1]] },
      ]),
    });
    refMaps.set(wc, new Map([[3, { path: [[0]] }]]));
    const probe = await queryElements(wc, '#new', 'css', refMaps);
    expect(probe.matches).toEqual([{ tag: 'div', attributes: { id: 'new' }, ref: 4 }]);
    expect(refMaps.get(wc)?.get(4)).toEqual({ path: [[2, 1]] });
  });

  it('mints SEQUENTIAL refs for multiple untracked matches in one call', async () => {
    const refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
    const { wc } = fakeWebContents({
      result: okResult([
        { tag: 'li', attributes: {}, existingRef: null, path: [[0, 0]] },
        { tag: 'li', attributes: {}, existingRef: null, path: [[0, 1]] },
      ]),
    });
    const probe = await queryElements(wc, 'li', 'css', refMaps);
    expect(probe.matches.map((m) => m.ref)).toEqual([1, 2]);
  });

  it('starts minting at 1 when the tab has no prior ref map at all', async () => {
    const { wc } = fakeWebContents({
      result: okResult([{ tag: 'div', attributes: {}, existingRef: null, path: [[0]] }]),
    });
    const probe = await queryElements(wc, 'div', 'css', new WeakMap());
    expect(probe.matches[0]?.ref).toBe(1);
  });

  it('reports ref: null (never a fabricated ref) when the script could not compute a path', async () => {
    const { wc } = fakeWebContents({
      result: okResult([{ tag: 'span', attributes: {}, existingRef: null, path: null }]),
    });
    const probe = await queryElements(wc, 'span', 'css', new WeakMap());
    expect(probe.matches).toEqual([{ tag: 'span', attributes: {}, ref: null }]);
  });

  it('reports the TRUE uncapped total even when the script already capped matches', async () => {
    const { wc } = fakeWebContents({
      result: okResult([{ tag: 'li', attributes: {}, existingRef: null, path: [[0]] }], 250),
    });
    const probe = await queryElements(wc, 'li', 'css', new WeakMap());
    expect(probe.total).toBe(250);
    expect(probe.matches).toHaveLength(1);
  });
});
