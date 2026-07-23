import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';
import {
  delay,
  FrameTreeSchema,
  IsolatedWorldSchema,
  NetworkCompleteSchema,
  NetworkRequestSchema,
  SETTLE_MS,
  type EnsureAttached,
} from './cdp-driver-schemas.electron.js';

/**
 * Session/lifecycle concern for {@link CdpDriver}: creating a per-page isolated world and waiting for a
 * page to settle after an interaction (load-stop → network idle → DOM quiescence). Each helper takes the
 * live `WebContents` plus the driver's `ensure` re-attach hook so the extracted logic never reaches back
 * into the class's private state.
 */

export async function mainFrameIsolatedContext(wc: WebContents): Promise<number> {
  const frameTreeRaw: unknown = await wc.debugger.sendCommand('Page.getFrameTree');
  const frameTree = FrameTreeSchema.safeParse(frameTreeRaw);
  if (!frameTree.success) throw new AppError('Failed to resolve the page frame for settling', 502);
  const worldRaw: unknown = await wc.debugger.sendCommand('Page.createIsolatedWorld', {
    frameId: frameTree.data.frameTree.frame.id,
    worldName: 'tepegoz-page-stability',
    grantUniveralAccess: false,
  });
  const world = IsolatedWorldSchema.safeParse(worldRaw);
  if (!world.success) throw new AppError('Failed to create an isolated settling context', 502);
  return world.data.executionContextId;
}

async function waitForLoadStop(wc: WebContents, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    wc.once('did-stop-loading', done);
  });
}

async function waitForNetworkIdle(
  wc: WebContents,
  ensure: EnsureAttached,
  quietMs: number,
  timeoutMs: number,
): Promise<void> {
  await ensure(wc);
  await new Promise<void>((resolve) => {
    const inflight = new Set<string>();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let onMessage: (_e: unknown, method: string, params?: unknown) => void = () => undefined;

    const done = (): void => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (!wc.isDestroyed()) {
        wc.debugger.removeListener('message', onMessage);
        wc.removeListener('destroyed', done);
      }
      resolve();
    };
    const scheduleIdle = (): void => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      if (inflight.size === 0) idleTimer = setTimeout(done, quietMs);
    };
    onMessage = (_e: unknown, method: string, params?: unknown): void => {
      if (method === 'Network.requestWillBeSent') {
        const parsed = NetworkRequestSchema.safeParse(params);
        if (!parsed.success) return;
        if (parsed.data.type === 'WebSocket' || parsed.data.type === 'EventSource') return;
        inflight.add(parsed.data.requestId);
        if (idleTimer !== null) clearTimeout(idleTimer);
        return;
      }
      if (method !== 'Network.loadingFinished' && method !== 'Network.loadingFailed') return;
      const parsed = NetworkCompleteSchema.safeParse(params);
      if (!parsed.success) return;
      inflight.delete(parsed.data.requestId);
      scheduleIdle();
    };

    wc.debugger.on('message', onMessage);
    wc.once('destroyed', done);
    timeoutTimer = setTimeout(done, timeoutMs);
    scheduleIdle();
  });
}

async function waitForDomQuiet(
  wc: WebContents,
  ensure: EnsureAttached,
  quietMs: number,
  timeoutMs: number,
): Promise<void> {
  await ensure(wc);
  const contextId = await mainFrameIsolatedContext(wc);
  const quiet = Math.max(0, Math.trunc(quietMs));
  const timeout = Math.max(quiet, Math.trunc(timeoutMs));
  await wc.debugger.sendCommand('Runtime.evaluate', {
    expression: `(() => new Promise((resolve) => {
      const quietMs = ${String(quiet)};
      const timeoutMs = ${String(timeout)};
      const root = document.documentElement || document.body;
      if (!root || typeof MutationObserver === 'undefined') {
        setTimeout(() => resolve('no-dom'), quietMs);
        return;
      }
      let observer = null;
      let quietTimer = 0;
      let timeoutTimer = 0;
      const finish = (reason) => {
        clearTimeout(quietTimer);
        clearTimeout(timeoutTimer);
        if (observer !== null) observer.disconnect();
        resolve(reason);
      };
      observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish('quiet'), quietMs);
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);
      quietTimer = setTimeout(() => finish('quiet'), quietMs);
    }))()`,
    contextId,
    awaitPromise: true,
    returnByValue: true,
    silent: true,
  });
}

/** Longest we wait for the page to acquire a non-zero layout viewport before perception. Short: with the
 *  content-view bounds fix in place this resolves on the first frame; the cap only matters on a
 *  pathological page and must never extend a run. */
const VIEWPORT_READY_MS = 300;

/**
 * Wait (bounded) until the page has a non-zero layout viewport, so perception never runs against a
 * 0×0 / unpainted view (which silently rejects every element — the AI-1 "no interactable elements"
 * blindness). Resolves as soon as `innerWidth>0 && innerHeight>0`, or after its own deadline regardless.
 * A safety net layered on top of the content-view bounds fix; strictly time-bounded and non-fatal.
 */
async function waitForViewport(wc: WebContents, ensure: EnsureAttached, timeoutMs: number): Promise<void> {
  await ensure(wc);
  const contextId = await mainFrameIsolatedContext(wc);
  const budget = Math.max(0, Math.trunc(timeoutMs));
  await wc.debugger.sendCommand('Runtime.evaluate', {
    expression: `(() => new Promise((resolve) => {
      const deadline = Date.now() + ${String(budget)};
      const ready = () => (window.innerWidth > 0 && window.innerHeight > 0);
      if (ready()) { resolve('ready'); return; }
      const tick = () => {
        if (ready()) { resolve('ready'); return; }
        if (Date.now() >= deadline) { resolve('timeout'); return; }
        (window.requestAnimationFrame || window.setTimeout)(tick);
      };
      tick();
    }))()`,
    contextId,
    awaitPromise: true,
    returnByValue: true,
    silent: true,
  });
}

/** Wait for a load triggered by an interaction to settle, then network and DOM quiescence. */
export async function waitForPageSettled(
  wc: WebContents,
  ensure: EnsureAttached,
  timeoutMs: number,
): Promise<void> {
  if (wc.isDestroyed()) return;
  await ensure(wc);
  const deadline = Date.now() + timeoutMs;
  if (wc.isLoadingMainFrame()) {
    await waitForLoadStop(wc, timeoutMs);
  }
  if (wc.isDestroyed()) return;

  const remaining = (): number => Math.max(SETTLE_MS, deadline - Date.now());
  await waitForNetworkIdle(wc, ensure, SETTLE_MS, remaining()).catch(() => undefined);
  if (wc.isDestroyed()) return;
  await waitForDomQuiet(wc, ensure, SETTLE_MS, remaining()).catch(() => delay(SETTLE_MS));
  if (wc.isDestroyed()) return;
  // Last: ensure a non-zero layout viewport before the next perception. Capped + non-fatal so it can
  // never extend or fail a settle.
  await waitForViewport(wc, ensure, Math.min(VIEWPORT_READY_MS, remaining())).catch(() => undefined);
}
