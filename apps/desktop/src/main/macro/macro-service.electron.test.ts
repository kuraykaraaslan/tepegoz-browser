import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `MacroService` — the main-process ext-macros orchestrator: CRUD over `MacroStore`, CSV attachment
 * through the content-addressed `BlobStore`, deterministic runs via `@tepegoz/macro-engine` with
 * streamed progress, and the record→Step stream. Pinned: the 503 DB guard, each CRUD/attach call
 * shape, the 404 for an unknown macro on run/runAwait, the engine-progress → wire-progress mapping,
 * the finished-outcome cache (`getRunOutcome`), `cancel` flipping the abort flag, `recordStart`'s 409
 * + index-incrementing callback, and the capability-host projection.
 */

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));

type RunResult = {
  ok: boolean;
  aborted: boolean;
  stepsRun: number;
  error?: { where: string; message: string };
};
const runMacro = vi.hoisted(() =>
  vi.fn<(macro: unknown, host: unknown, opts: unknown) => Promise<RunResult>>(() =>
    Promise.resolve({ ok: true, aborted: false, stepsRun: 2 }),
  ),
);
vi.mock('@tepegoz/macro-engine', () => ({ runMacro }));

vi.mock('@tepegoz/ext-macros/csv', () => ({ parseCsv: (s: string) => [{ raw: s }] }));

const blob = vi.hoisted(() => ({
  get: vi.fn((): unknown => Buffer.from('a,b\n1,2', 'utf8')),
  put: vi.fn(() => 'cas://deadbeef'),
}));
const store = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'm1', name: 'M1', stepCount: 1 }]),
  get: vi.fn((): unknown => ({ id: 'm1', name: 'M1', steps: [{}, {}] })),
  save: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@tepegoz/persistence', () => ({ BlobStore: blob, MacroStore: store }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const hostFactory = vi.hoisted(() => vi.fn((deps: unknown) => ({ __host: true, deps })));
vi.mock('./macro-host.electron', () => ({ createMacroHost: hostFactory }));
vi.mock('./macro-selector-healer.electron', () => ({ healSelector: vi.fn() }));

const recorder = vi.hoisted(() => ({
  start: vi.fn<(wc: unknown, cb: (step: unknown) => void) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  stop: vi.fn(() => Promise.resolve()),
}));
vi.mock('../agent/macro-recorder.electron', () => ({ default: recorder }));

const tab = vi.hoisted((): { wc: unknown } => ({ wc: { __wc: true } }));
vi.mock('../tabs', () => ({ default: { activeWebContents: () => tab.wc } }));

const { default: MacroService } = await import('./macro-service.electron');

const MACRO = { id: 'm1', name: 'Checkout', steps: [{}, {}, {}] } as never;
const input = (macroId: string) => ({ macroId }) as Parameters<typeof MacroService.run>[0];

/** Run `fn` and return the AppError it threw. */
function grab(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a throw');
}

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  tab.wc = { __wc: true };
  runMacro.mockResolvedValue({ ok: true, aborted: false, stepsRun: 2 });
  store.get.mockReturnValue({ id: 'm1', name: 'M1', steps: [{}, {}] });
  blob.put.mockReturnValue('cas://deadbeef');
});

describe('the DB guard', () => {
  it('throws a 503 when the database is not ready', () => {
    db.value = null;
    const err = grab(() => MacroService.list());
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('databaseUnavailable');
  });
});

describe('CRUD + CSV', () => {
  it('list / get / delete pass the db through to MacroStore', () => {
    MacroService.list();
    MacroService.get('m1');
    MacroService.delete('m1');
    expect(store.list).toHaveBeenCalledWith({ __db: true });
    expect(store.get).toHaveBeenCalledWith({ __db: true }, 'm1');
    expect(store.delete).toHaveBeenCalledWith({ __db: true }, 'm1');
  });

  it('save persists then returns a summary with the step count', () => {
    const summary = MacroService.save(MACRO);
    expect(store.save).toHaveBeenCalledWith({ __db: true }, MACRO, expect.any(Number));
    expect(summary).toMatchObject({ id: 'm1', name: 'Checkout', stepCount: 3 });
  });

  it('attachCsv stores a blob and returns the bare hash (cas:// stripped)', () => {
    expect(MacroService.attachCsv('a,b\n1,2')).toBe('deadbeef');
    expect(blob.put).toHaveBeenCalledWith({ __db: true }, Buffer.from('a,b\n1,2', 'utf8'));
  });

  it('attachCsv returns the ref unchanged when it has no cas:// prefix', () => {
    blob.put.mockReturnValue('rawhash');
    expect(MacroService.attachCsv('x')).toBe('rawhash');
  });
});

describe('run / runAwait', () => {
  it('run rejects an unknown macro id with a 404', () => {
    store.get.mockReturnValue(null);
    expect(grab(() => MacroService.run(input('gone'), vi.fn())).statusCode).toBe(404);
  });

  it('run returns a runId and streams mapped progress to emit', async () => {
    runMacro.mockImplementation((_m: unknown, _h: unknown, opts: unknown) => {
      const o = opts as { onProgress?: (ev: unknown) => void };
      o.onProgress?.({ phase: 'started', total: 3 });
      o.onProgress?.({ phase: 'step', path: [1], kind: 'click' });
      o.onProgress?.({ phase: 'failed', path: [2], detail: 'boom' });
      o.onProgress?.({ phase: 'done' });
      return Promise.resolve({ ok: true, aborted: false, stepsRun: 3 });
    });
    const emit = vi.fn<(p: unknown) => void>();
    const runId = MacroService.run(input('m1'), emit);
    expect(typeof runId).toBe('string');
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(4));
    expect(emit.mock.calls.map((c) => c[0])).toEqual([
      { runId, phase: 'started', total: 3 },
      { runId, phase: 'step', index: 1, kind: 'click' },
      { runId, phase: 'failed', failingStep: 2, detail: 'boom' },
      { runId, phase: 'done' },
    ]);
  });

  it('runAwait resolves with the outcome and maps an engine error', async () => {
    runMacro.mockResolvedValue({
      ok: false,
      aborted: false,
      stepsRun: 1,
      error: { where: 'step 2', message: 'not found' },
    });
    const outcome = await MacroService.runAwait(input('m1'));
    expect(outcome).toMatchObject({
      ok: false,
      stepsRun: 1,
      error: { where: 'step 2', message: 'not found' },
    });
    expect(MacroService.getRunOutcome(outcome.runId)).toEqual(outcome);
  });

  it('runAwait 404s an unknown macro', () => {
    store.get.mockReturnValue(null);
    expect(grab(() => MacroService.runAwait(input('nope'))).statusCode).toBe(404);
  });

  it('getRunOutcome is null for an unknown run id', () => {
    expect(MacroService.getRunOutcome('never-ran')).toBeNull();
  });

  it('the run host is built with a readCsv that reads the blob then parses it', async () => {
    MacroService.run(input('m1'), vi.fn());
    await vi.waitFor(() => expect(hostFactory).toHaveBeenCalled());
    const deps = hostFactory.mock.calls[0]![0] as { readCsv: (h: string) => Promise<unknown> };
    expect(await deps.readCsv('h1')).toEqual([{ raw: 'a,b\n1,2' }]);
    blob.get.mockReturnValue(undefined);
    expect(await deps.readCsv('missing')).toEqual([]);
  });

  it('forwards cursor callbacks into the macro host when cursorOpts is given', async () => {
    const onCursorMove = vi.fn();
    const onCursorHide = vi.fn();
    MacroService.run(input('m1'), vi.fn(), { onCursorMove, onCursorHide });
    await vi.waitFor(() => expect(hostFactory).toHaveBeenCalled());
    const deps = hostFactory.mock.calls[0]![0] as {
      onCursorMove?: unknown;
      onCursorHide?: unknown;
    };
    expect(deps.onCursorMove).toBe(onCursorMove);
    expect(deps.onCursorHide).toBe(onCursorHide);
  });

  it('runDraft runs an unsaved macro directly, with no MacroStore lookup', () => {
    store.get.mockReturnValue(null); // a saved run would 404 — a draft must not care
    const runId = MacroService.runDraft(MACRO, undefined, vi.fn());
    expect(typeof runId).toBe('string');
    expect(store.get).not.toHaveBeenCalled();
  });

  it('evicts the oldest finished outcome once the recent-outcome cache fills', async () => {
    const first = (await MacroService.runAwait(input('m1'))).runId;
    for (let i = 0; i < 50; i += 1) await MacroService.runAwait(input('m1'));
    expect(MacroService.getRunOutcome(first)).toBeNull(); // pushed past MAX_RECENT
    const last = (await MacroService.runAwait(input('m1'))).runId;
    expect(MacroService.getRunOutcome(last)).not.toBeNull();
  });

  it('cancel flips the abort flag for a live run and is a no-op otherwise', () => {
    let seenSignal: { aborted: boolean } | undefined;
    runMacro.mockImplementation((_m: unknown, _h: unknown, opts: unknown) => {
      seenSignal = (opts as { signal: { aborted: boolean } }).signal;
      return Promise.resolve({ ok: true, aborted: false, stepsRun: 0 });
    });
    const runId = MacroService.run(input('m1'), vi.fn());
    MacroService.cancel(runId);
    expect(seenSignal?.aborted).toBe(true);
    expect(() => MacroService.cancel('bogus')).not.toThrow();
  });
});

describe('recording', () => {
  it('recordStart 409s with no active tab', async () => {
    tab.wc = null;
    await expect(MacroService.recordStart(vi.fn())).rejects.toMatchObject({ statusCode: 409 });
  });

  it('recordStart streams captured steps with an incrementing index', async () => {
    const onStep = vi.fn();
    await MacroService.recordStart(onStep);
    const cb = recorder.start.mock.calls[0]![1];
    cb({ kind: 'click' });
    cb({ kind: 'type' });
    expect(onStep).toHaveBeenNthCalledWith(1, 0, { kind: 'click' });
    expect(onStep).toHaveBeenNthCalledWith(2, 1, { kind: 'type' });
  });

  it('recordStop delegates to the recorder', async () => {
    await MacroService.recordStop();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });
});

describe('capabilityHost', () => {
  it('projects the same operations, routing run → runAwait and getRun → getRunOutcome', async () => {
    const host = MacroService.capabilityHost();
    host.list();
    host.get('m1');
    host.save(MACRO);
    host.delete('m1');
    expect(store.list).toHaveBeenCalled();
    expect(store.get).toHaveBeenCalledWith({ __db: true }, 'm1');
    expect(store.save).toHaveBeenCalled();
    expect(store.delete).toHaveBeenCalledWith({ __db: true }, 'm1');

    const outcome = await host.run(input('m1'));
    expect(host.getRun(outcome.runId)).toEqual(outcome);
  });
});
