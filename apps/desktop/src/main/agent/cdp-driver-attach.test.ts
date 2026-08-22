import { describe, it, expect } from 'vitest';
import type { WebContents } from 'electron';
import CdpDriver from './cdp-driver.electron';

/**
 * Regression: `webContents.debugger` allows ONE client per tab, and the agent is not the only attacher
 * in this app — the typo/translate/video-player page injectors and the macro recorder attach to the
 * pages they enhance. `ensureAttached` used to gate on its own bookkeeping only, so an injector that
 * reached the tab first made every agent CDP call throw `Debugger is already attached to the target`,
 * permanently: the throw also skipped the bookkeeping, so each retry took the same path. Observed on a
 * LinkedIn tab (2026-08-21 export) — six consecutive tool failures and a dead run.
 */
interface Harness {
  wc: WebContents;
  attachCalls: number;
  enabled: string[];
}

function makeWc(alreadyAttached: boolean): Harness {
  const h: Harness = { attachCalls: 0, enabled: [], wc: undefined as unknown as WebContents };
  let attached = alreadyAttached;
  h.wc = {
    isDestroyed: () => false,
    getURL: () => 'https://example.com/',
    on: () => undefined,
    once: () => undefined,
    debugger: {
      isAttached: () => attached,
      attach: () => {
        h.attachCalls += 1;
        // Electron's real behaviour: attaching over a live session throws.
        if (attached) throw new Error('Debugger is already attached to the target');
        attached = true;
      },
      on: () => undefined,
      once: () => undefined,
      sendCommand: (method: string) => {
        h.enabled.push(method);
        return Promise.resolve({});
      },
    },
  } as unknown as WebContents;
  return h;
}

/** `readElementValue` is the cheapest public entry that runs `ensureAttached` and nothing heavier. */
async function driveOnce(wc: WebContents): Promise<string> {
  try {
    await CdpDriver.readElementValue(wc, 1);
    return 'resolved';
  } catch (err) {
    return String((err as Error).message);
  }
}

describe('CdpDriver.ensureAttached', () => {
  it('adopts a session another part of the app already attached instead of attaching over it', async () => {
    const h = makeWc(true);

    const message = await driveOnce(h.wc);

    expect(h.attachCalls).toBe(0);
    // It got PAST attachment — the only complaint left is the empty ref map, not a debugger conflict.
    expect(message).not.toMatch(/already attached/i);
    expect(message).toMatch(/stale/i);
    expect(h.enabled).toContain('Accessibility.enable');
  });

  it('still attaches when nobody holds the tab', async () => {
    const h = makeWc(false);

    const message = await driveOnce(h.wc);

    expect(h.attachCalls).toBe(1);
    expect(message).toMatch(/stale/i);
    expect(h.enabled).toContain('Network.enable');
  });
});
