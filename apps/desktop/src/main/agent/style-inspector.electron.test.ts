import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { styleOfRef } from './style-inspector.electron';
import type { RefTarget } from './cdp-driver-schemas.electron';

/**
 * Locks the contract `browser_get_styles` depends on: no CDP call anywhere (only
 * `executeJavaScriptInIsolatedWorld`, Electron's own API), a `backendNodeId`-only target (a11y fallback)
 * degrading to `null` rather than reaching for CDP, and a malformed/unexpected page result degrading to
 * `null` rather than being trusted or throwing.
 */

function fakeWebContents(
  opts: {
    destroyed?: boolean;
    result?: unknown;
    reject?: Error;
  } = {},
): { wc: WebContents; calls: unknown[][]; debuggerSendCommand: ReturnType<typeof vi.fn> } {
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

const pathTarget: RefTarget = { path: [[0]] };
const a11yTarget: RefTarget = { backendNodeId: 42 };

const foundProbe = {
  found: true,
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  position: 'static',
  zIndex: 'auto',
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  x: 10,
  y: 20,
  width: 100,
  height: 30,
  visible: true,
};

describe('P3-d style inspector', () => {
  it('resolves a well-formed probe via executeJavaScriptInIsolatedWorld, never wc.debugger', async () => {
    const { wc, calls, debuggerSendCommand } = fakeWebContents({ result: foundProbe });
    const probe = await styleOfRef(wc, pathTarget);
    expect(probe).toEqual({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      zIndex: 'auto',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      visible: true,
    });
    expect(calls).toHaveLength(1);
    expect(debuggerSendCommand).not.toHaveBeenCalled();
  });

  it('returns null for a target with no path (accessibility-tree fallback) rather than reaching for CDP', async () => {
    const { wc, calls } = fakeWebContents({ result: foundProbe });
    const probe = await styleOfRef(wc, a11yTarget);
    expect(probe).toBeNull();
    expect(calls).toHaveLength(0); // never even asked the page
  });

  it('returns null for an undefined target (unknown/stale ref)', async () => {
    const { wc } = fakeWebContents({ result: foundProbe });
    expect(await styleOfRef(wc, undefined)).toBeNull();
  });

  it('returns null for a destroyed tab without touching the page', async () => {
    const { wc, calls } = fakeWebContents({ destroyed: true, result: foundProbe });
    expect(await styleOfRef(wc, pathTarget)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when the page reports found:false', async () => {
    const { wc } = fakeWebContents({ result: { found: false } });
    expect(await styleOfRef(wc, pathTarget)).toBeNull();
  });

  it('returns null for a malformed page result instead of trusting it', async () => {
    const { wc } = fakeWebContents({ result: { found: true, display: 42 } });
    expect(await styleOfRef(wc, pathTarget)).toBeNull();
  });

  it('returns null (never throws) when the isolated-world read rejects', async () => {
    const { wc } = fakeWebContents({ reject: new Error('frame gone') });
    await expect(styleOfRef(wc, pathTarget)).resolves.toBeNull();
  });
});
