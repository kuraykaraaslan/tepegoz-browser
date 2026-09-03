import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerToolsIpc` — on-device model management + macros IPC. Pinned: the model-progress listener
 * broadcasts `models:state` to every live window; the `models*` handlers delegate to `ModelManager`;
 * every macro handler refuses (403 `extensionDisabled`) when `com.tepegoz.macros` is off and otherwise
 * delegates to `MacroService`; and `macrosRun` / `macrosRunDraft` wire the cursor + progress callbacks
 * to `sender.send` (offsetting cursor coords by the content bounds).
 */

const IpcChannels = new Proxy({}, { get: (_t, k) => k, has: () => true });
const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels, isExtensionEnabled }));
vi.mock(
  '@tepegoz/desktop-ipc/schemas',
  () =>
    new Proxy(
      {},
      {
        get: (_t, k) => (k === '__esModule' ? true : { parse: (x: unknown) => x }),
        has: () => true,
      },
    ),
);

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
vi.mock('@tepegoz/ext-macros/manifest', () => ({ macrosManifest: { id: 'com.tepegoz.macros' } }));

const ModelManager = vi.hoisted(() => ({
  setProgressListener: vi.fn(),
  list: vi.fn(() => [{ id: 'm1' }]),
  download: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(),
  select: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../model-catalog/model-manager.electron', () => ({ default: ModelManager }));

const MacroService = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'x' }]),
  get: vi.fn(() => ({ id: 'x', steps: [] })),
  save: vi.fn(() => ({ id: 'x' })),
  delete: vi.fn(),
  attachCsv: vi.fn(() => 'csv-ref'),
  run: vi.fn<
    (
      input: unknown,
      cb: (p: unknown) => void,
      opts: { onCursorMove: (x: number, y: number) => void; onCursorHide: () => void },
    ) => string
  >(() => 'run-1'),
  runDraft: vi.fn<
    (macro: unknown, vars: unknown, cb: (p: unknown) => void, opts: unknown) => string
  >(() => 'run-2'),
  cancel: vi.fn(),
  recordStart: vi.fn<(cb: (i: number, s: unknown) => void) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  recordStop: vi.fn(() => Promise.resolve()),
}));
vi.mock('../macro/macro-service.electron', () => ({ default: MacroService }));

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ extensions: [] as unknown[] })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
vi.mock('../tabs', () => ({ default: { getContentBounds: () => ({ x: 100, y: 40 }) } }));

const bw = vi.hoisted(() => ({ getAllWindows: vi.fn(() => [] as unknown[]) }));
vi.mock('electron', () => ({ BrowserWindow: bw }));

const H = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, p: unknown) => unknown>(),
  actions: new Map<string, (v: unknown) => void>(),
}));
vi.mock('./ipc-helpers', () => ({
  handle: (ch: string, fn: (e: unknown, p: unknown) => unknown) => H.handlers.set(ch, fn),
  handleAsync: (ch: string, fn: (e: unknown, p: unknown) => unknown) => H.handlers.set(ch, fn),
  onAction: (ch: string, _s: unknown, fn: (v: unknown) => void) => H.actions.set(ch, fn),
}));

const mod = await import('./ipc-content-tools');

let send: ReturnType<typeof vi.fn>;
let event: { sender: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } };
const call = (ch: string, p?: unknown): unknown => H.handlers.get(ch)!(event, p);

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionEnabled.mockReturnValue(true);
  bw.getAllWindows.mockReturnValue([]);
  send = vi.fn();
  event = { sender: { isDestroyed: () => false, send } };
  mod.registerToolsIpc();
});

describe('on-device models', () => {
  it('the progress listener broadcasts models:state to every live window', () => {
    const cb = ModelManager.setProgressListener.mock.calls[0]![0] as (m: unknown) => void;
    const live = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } };
    bw.getAllWindows.mockReturnValue([dead, live]);
    cb([{ id: 'm1' }]);
    expect(live.webContents.send).toHaveBeenCalledWith('modelsState', [{ id: 'm1' }]);
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });

  it('list / download / cancel / select / delete delegate to ModelManager', async () => {
    expect(call('modelsList')).toEqual([{ id: 'm1' }]);
    await call('modelsDownload', 'm2');
    expect(ModelManager.download).toHaveBeenCalledWith('m2');
    H.actions.get('modelsCancel')!('m3');
    expect(ModelManager.cancel).toHaveBeenCalledWith('m3');
    call('modelsSelect', 'm4');
    call('modelsDelete', 'm5');
    expect(ModelManager.select).toHaveBeenCalledWith('m4');
    expect(ModelManager.remove).toHaveBeenCalledWith('m5');
  });
});

describe('macros — the enabled gate', () => {
  it('403s every macro handler when the extension is disabled', () => {
    isExtensionEnabled.mockReturnValue(false);
    for (const ch of ['macrosList', 'macrosGet', 'macrosSave', 'macrosDelete', 'macrosAttachCsv']) {
      let thrown: unknown;
      try {
        call(ch, {});
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toMatchObject({ statusCode: 403, code: 'extensionDisabled' });
    }
  });

  it('macrosCancel is a silent no-op when disabled', () => {
    isExtensionEnabled.mockReturnValue(false);
    H.actions.get('macrosCancel')!('run-1');
    expect(MacroService.cancel).not.toHaveBeenCalled();
  });
});

describe('macros — CRUD', () => {
  it('list / get / save / delete / attachCsv delegate to MacroService', () => {
    expect(call('macrosList')).toEqual([{ id: 'x' }]);
    expect(call('macrosGet', 'x')).toEqual({ id: 'x', steps: [] });
    expect(call('macrosSave', { id: 'x', steps: [] })).toEqual({ id: 'x' });
    call('macrosDelete', 'x');
    expect(MacroService.delete).toHaveBeenCalledWith('x');
    expect(call('macrosAttachCsv', { content: 'a,b\n1,2' })).toBe('csv-ref');
    expect(MacroService.attachCsv).toHaveBeenCalledWith('a,b\n1,2');
  });
});

describe('macros — run wiring', () => {
  it('macrosRun wires cursor + progress callbacks to sender.send', () => {
    expect(call('macrosRun', { macroId: 'x' })).toEqual({ runId: 'run-1' });
    const [, progress, opts] = MacroService.run.mock.calls[0]!;

    opts.onCursorMove(10, 20);
    expect(send).toHaveBeenCalledWith('cursorPosition', { x: 110, y: 60, visible: true });
    opts.onCursorHide();
    expect(send).toHaveBeenCalledWith('cursorPosition', { x: 0, y: 0, visible: false });
    progress({ step: 1 });
    expect(send).toHaveBeenCalledWith('macrosRunProgress', { step: 1 });
  });

  it('macrosRunDraft delegates to runDraft and wires the same cursor + progress callbacks', () => {
    expect(call('macrosRunDraft', { macro: { id: 'd' }, variables: { k: 'v' } })).toEqual({
      runId: 'run-2',
    });
    expect(MacroService.runDraft).toHaveBeenCalledWith(
      { id: 'd' },
      { k: 'v' },
      expect.any(Function),
      expect.anything(),
    );

    const [, , progress, opts] = MacroService.runDraft.mock.calls[0]!;
    const o = opts as { onCursorMove: (x: number, y: number) => void; onCursorHide: () => void };
    o.onCursorMove(10, 20);
    expect(send).toHaveBeenCalledWith('cursorPosition', { x: 110, y: 60, visible: true });
    o.onCursorHide();
    expect(send).toHaveBeenCalledWith('cursorPosition', { x: 0, y: 0, visible: false });
    progress({ step: 1 });
    expect(send).toHaveBeenCalledWith('macrosRunProgress', { step: 1 });
  });

  it('macrosCancel cancels the run when enabled', () => {
    H.actions.get('macrosCancel')!('run-1');
    expect(MacroService.cancel).toHaveBeenCalledWith('run-1');
  });
});

describe('macros — record', () => {
  it('recordStart streams captured steps and recordStop delegates', async () => {
    await call('macrosRecordStart');
    const cb = MacroService.recordStart.mock.calls[0]![0];
    cb(2, { kind: 'click' });
    expect(send).toHaveBeenCalledWith('macrosRecordStep', { index: 2, step: { kind: 'click' } });

    await call('macrosRecordStop');
    expect(MacroService.recordStop).toHaveBeenCalled();
  });
});
