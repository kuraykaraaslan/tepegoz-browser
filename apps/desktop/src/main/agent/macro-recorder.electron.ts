import { z } from 'zod';
import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import type { Step } from '@tepegoz/shared-types';
import { BINDING, CAPTURE_SRC, CaptureSchema, toStep } from '@tepegoz/ext-macros/capture-script';

/**
 * Passive **macro recorder** wiring: injects the extension's capture script (via
 * `Page.addScriptToEvaluateOnNewDocument`, so it survives navigations) and turns each
 * `Runtime.bindingCalled` payload into a deterministic {@link Step}. The pure capture script + payload
 * schema + `Step` conversion (incl. the secret-redaction rule) live in
 * `@tepegoz/ext-macros/capture-script`; this file is the Electron/CDP half.
 *
 * NOTE: the capture script runs in the page's main world for simplicity; moving it to an isolated
 * world (like Chrome DevTools Recorder) is a hardening follow-up. Only a user-initiated "Record" starts
 * it, and it is read-only (it observes events; it never acts).
 */
export default class MacroRecorder {
  private static active: { wc: WebContents; scriptId?: string; onStep: (step: Step) => void } | null =
    null;

  /** Start recording on `wc`; `onStep` is invoked for each captured Step. One recording at a time. */
  static async start(wc: WebContents, onStep: (step: Step) => void): Promise<void> {
    if (MacroRecorder.active !== null) throw new AppError('A recording is already in progress', 409);
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Runtime.enable');
    await wc.debugger.sendCommand('Page.enable');
    await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING });

    const listener = (_e: unknown, method: string, params?: unknown): void => {
      if (method !== 'Runtime.bindingCalled') return;
      const parsed = z
        .object({ name: z.string(), payload: z.string() })
        .safeParse(params);
      if (!parsed.success || parsed.data.name !== BINDING) return;
      let cap: z.infer<typeof CaptureSchema> | null = null;
      try {
        cap = CaptureSchema.parse(JSON.parse(parsed.data.payload));
      } catch {
        return;
      }
      const step = toStep(cap);
      if (step !== null) onStep(step);
    };
    wc.debugger.on('message', listener);

    const res: unknown = await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: CAPTURE_SRC,
    });
    const scriptId = z.object({ identifier: z.string() }).safeParse(res);
    // Also inject into the already-loaded page so recording works without a reload.
    await wc.debugger.sendCommand('Runtime.evaluate', { expression: CAPTURE_SRC }).catch(() => undefined);

    MacroRecorder.active = {
      wc,
      onStep,
      ...(scriptId.success ? { scriptId: scriptId.data.identifier } : {}),
    };
    // Keep the listener reachable for stop().
    MacroRecorder.listeners.set(wc, listener);
  }

  private static readonly listeners = new Map<
    WebContents,
    (e: unknown, method: string, params?: unknown) => void
  >();

  /** Stop the active recording (best-effort teardown). */
  static async stop(): Promise<void> {
    const active = MacroRecorder.active;
    if (active === null) return;
    MacroRecorder.active = null;
    const { wc, scriptId } = active;
    const listener = MacroRecorder.listeners.get(wc);
    if (listener !== undefined) {
      wc.debugger.removeListener('message', listener);
      MacroRecorder.listeners.delete(wc);
    }
    if (wc.isDestroyed() || !wc.debugger.isAttached()) return;
    try {
      if (scriptId !== undefined) {
        await wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: scriptId,
        });
      }
      await wc.debugger.sendCommand('Runtime.removeBinding', { name: BINDING });
    } catch (err) {
      Logger.warn('macro recorder teardown failed', { err: String(err) });
    }
  }
}
