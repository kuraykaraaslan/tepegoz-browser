import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@tepegoz/libs';
import { isOriginSwap, originSwapMessage } from '@tepegoz/tool-executor';
import { clickElement, fillElement } from './cdp-driver-input.electron.js';
import type { DriverCore, NodeArg } from './cdp-driver-schemas.electron.js';

/**
 * The navigation-swap gate as the driver actually applies it (S4 PR2).
 *
 * `origin-guard.test.ts` proves the RULE; this proves the WIRING — that a state-changing entry point
 * consults it before resolving a ref, and that the refusal reaches the caller as an `AppError` rather
 * than a click sent to a page nobody read.
 */

/** A `DriverCore` whose origin check mirrors the real one, over a URL the test controls. */
function coreFor(locatedAt: string, nowAt: string): DriverCore & { resolved: number } {
  const core = {
    resolved: 0,
    ensure: () => Promise.resolve(),
    settle: () => Promise.resolve(),
    resolveRef: (): Promise<NodeArg> => {
      core.resolved += 1;
      return Promise.resolve({ backendNodeId: 1 });
    },
    assertSameOrigin: () => {
      if (isOriginSwap(locatedAt, nowAt)) {
        throw new AppError(originSwapMessage(locatedAt, nowAt), 409);
      }
    },
  };
  return core;
}

const wc = {} as never;

describe('state-changing actions after a navigation swap', () => {
  it('refuses a click and never resolves the ref', async () => {
    const core = coreFor('http://127.0.0.1:5001/bank/', 'http://127.0.0.1:5002/bank/');
    await expect(clickElement(wc, 3, undefined, core)).rejects.toThrow(/changed origin/);
    // The point is not that the click failed — it is that nothing was dispatched at all.
    expect(core.resolved).toBe(0);
  });

  it('refuses a fill the same way', async () => {
    const core = coreFor('https://bank.test/', 'https://bank-secure.test/');
    await expect(fillElement(wc, 1, 'secret', undefined, core)).rejects.toThrow(/NOT performed/);
    expect(core.resolved).toBe(0);
  });

  it('raises a 409, so the reactor sees a recoverable step failure rather than a dead run', async () => {
    const core = coreFor('https://bank.test/', 'https://bank-secure.test/');
    await clickElement(wc, 3, undefined, core).then(
      () => expect.unreachable('should have refused'),
      (err: unknown) => {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
      },
    );
  });

  it('does not stand in the way when the page is the same one the ref was found on', async () => {
    // A different PAGE on the same origin is the ordinary case and must pass the gate. The click then
    // fails downstream because this test has no real DOM — which is the proof that the gate let it
    // through: resolution happened, and the error is about geometry, not about origin.
    const core = coreFor('https://acme.test/cart', 'https://acme.test/checkout');
    const send = vi.fn(() => Promise.resolve(undefined));
    const withDebugger = { debugger: { sendCommand: send } } as never;
    await expect(clickElement(withDebugger, 2, undefined, core)).rejects.toThrow(/not visible/);
    expect(core.resolved).toBe(1);
  });
});
