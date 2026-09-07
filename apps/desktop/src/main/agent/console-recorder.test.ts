import { describe, expect, it } from 'vitest';
import type { WebContents } from 'electron';
import { attachConsoleRecorder, consoleSince } from './console-recorder.electron';

/**
 * Locks the contract `browser_get_console` depends on: the SHAPE Electron's `console-message` event
 * delivers (the non-deprecated event-object form), the bounded ring, and the honest-absence rule. This
 * is a plain `webContents` event listener — no `debugger`, no CDP, no DevTools (ADR-0029 untouched).
 */

/** Minimal stand-in for the `webContents` surface the recorder touches. */
function fakeWebContents(): {
  wc: WebContents;
  emit: (details: unknown) => void;
  emitOnce: (event: string) => void;
} {
  const handlers: Array<(details: unknown) => void> = [];
  const onceHandlers = new Map<string, () => void>();
  const wc = {
    on: (event: string, handler: (details: unknown) => void) => {
      if (event === 'console-message') handlers.push(handler);
    },
    once: (event: string, handler: () => void) => {
      onceHandlers.set(event, handler);
    },
  } as unknown as WebContents;
  return {
    wc,
    emit: (details) => {
      for (const h of handlers) h(details);
    },
    emitOnce: (event) => onceHandlers.get(event)?.(),
  };
}

/** A real-shaped `console-message` event object (new form: params on the event, not positional). */
const consoleEvent = (over: Record<string, unknown> = {}): unknown => ({
  level: 'error',
  message: 'Uncaught TypeError: x is not a function',
  lineNumber: 42,
  sourceId: 'https://x/app.js',
  preventDefault: () => undefined,
  ...over,
});

describe('P3-d console recorder', () => {
  it('records a console message from the real event shape', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    const before = Date.now();
    emit(consoleEvent());

    const seen = consoleSince(wc, before);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      level: 'error',
      text: 'Uncaught TypeError: x is not a function',
      source: 'https://x/app.js',
      line: 42,
    });
  });

  it('strips query and credentials from the source URL at record time', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    emit(consoleEvent({ sourceId: 'https://u:pw@x/app.js?token=SECRET#f' }));
    const source = consoleSince(wc, 0)[0]?.source ?? '';
    expect(source).not.toContain('SECRET');
    expect(source).not.toContain('pw');
    expect(source).toContain('/app.js');
  });

  it('defaults a missing line number to 0 and tolerates a missing sourceId', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    emit(consoleEvent({ lineNumber: undefined, sourceId: undefined }));
    expect(consoleSince(wc, 0)[0]).toMatchObject({ line: 0, source: '' });
  });

  it('drops a malformed event instead of throwing (a diagnostics nicety must never break driving)', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    expect(() => {
      emit({ level: 'trace', message: 'x' }); // level not in the enum
      emit({ level: 'error', message: 42 }); // message not a string
      emit(null);
      emit(undefined);
    }).not.toThrow();
    expect(consoleSince(wc, 0)).toEqual([]);
  });

  it('filters by the requested window', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    emit(consoleEvent());
    expect(consoleSince(wc, Date.now() + 1_000)).toEqual([]);
  });

  it('is idempotent — re-attaching on a tab switch does not double-record', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    attachConsoleRecorder(wc);
    attachConsoleRecorder(wc);
    emit(consoleEvent());
    expect(consoleSince(wc, 0)).toHaveLength(1);
  });

  it('caps the ring, dropping the oldest messages', () => {
    const { wc, emit } = fakeWebContents();
    attachConsoleRecorder(wc);
    for (let i = 0; i < 250; i++) emit(consoleEvent({ message: `m${String(i)}` }));
    const seen = consoleSince(wc, 0);
    expect(seen).toHaveLength(200);
    expect(seen[0]?.text).toBe('m50'); // 0..49 evicted
    expect(seen[seen.length - 1]?.text).toBe('m249');
  });

  it("the 'destroyed' handler drops the tab's recorder state", () => {
    const { wc, emit, emitOnce } = fakeWebContents();
    attachConsoleRecorder(wc);
    emit(consoleEvent());
    expect(consoleSince(wc, 0)).toHaveLength(1);

    emitOnce('destroyed');
    expect(consoleSince(wc, 0)).toEqual([]);
  });

  it('returns an empty log for a tab that was never attached — never a claim the page was quiet', () => {
    const { wc } = fakeWebContents();
    expect(consoleSince(wc, 0)).toEqual([]);
  });
});
