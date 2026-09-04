import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `loginsMacrosApi` — the login-manager + macros slice of the preload bridge. Raw secrets never cross
 * it (only metadata returns), so what is pinned here is the exact channel each method targets and the
 * payload SHAPE it wraps its args in — notably `setLogin` renaming `password` → `secret` — plus the
 * subscribe / forward-payload-only / unsubscribe contract of the four `on*` listeners and the two
 * fire-and-forget `send` methods.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { loginsMacrosApi } = await import('./api-logins-macros');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

describe('login credential manager', () => {
  it('listLogins → loginsList, no payload', () => {
    void loginsMacrosApi.listLogins();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsList);
  });

  it('setLogin renames password → secret and forwards the optional fields', () => {
    void loginsMacrosApi.setLogin({
      url: 'https://site.test',
      username: 'ada',
      password: 'hunter2',
      title: 'Site',
      notes: 'primary',
    });
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsSet, {
      url: 'https://site.test',
      username: 'ada',
      secret: 'hunter2',
      title: 'Site',
      notes: 'primary',
    });
  });

  it('setLogin leaves title / notes undefined when omitted', () => {
    void loginsMacrosApi.setLogin({ url: 'https://site.test', username: 'ada', password: 'p' });
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsSet, {
      url: 'https://site.test',
      username: 'ada',
      secret: 'p',
      title: undefined,
      notes: undefined,
    });
  });

  it('removeLogin → loginsRemove with the bare id', () => {
    void loginsMacrosApi.removeLogin('cred-1');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsRemove, 'cred-1');
  });

  it('importLogins → loginsImport with { data, format }', () => {
    void loginsMacrosApi.importLogins('csv-body', 'chrome');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsImport, {
      data: 'csv-body',
      format: 'chrome',
    });
  });

  it('exportLogins → loginsExport with the bare format', () => {
    void loginsMacrosApi.exportLogins('csv');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.loginsExport, 'csv');
  });

  it('onAutofillAvailable wires a listener, forwards only the payload, and removes it on the returned fn', () => {
    const cb = vi.fn();
    const off = loginsMacrosApi.onAutofillAvailable(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.loginsAutofillAvailable, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({}, { origin: 'https://site.test', credentials: [] });
    expect(cb).toHaveBeenCalledWith({ origin: 'https://site.test', credentials: [] });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.loginsAutofillAvailable, listener);
  });

  it('fillLogin sends loginsFill with { credentialId }', () => {
    loginsMacrosApi.fillLogin('cred-9');
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.loginsFill, { credentialId: 'cred-9' });
  });
});

describe('macros', () => {
  it('listMacros → macrosList', () => {
    void loginsMacrosApi.listMacros();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosList);
  });

  it('getMacro → macrosGet with the bare id', () => {
    void loginsMacrosApi.getMacro('m1');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosGet, 'm1');
  });

  it('saveMacro → macrosSave with the macro through bare', () => {
    const macro = { id: 'm1', name: 'M', steps: [] } as never;
    void loginsMacrosApi.saveMacro(macro);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosSave, macro);
  });

  it('deleteMacro → macrosDelete with the bare id', () => {
    void loginsMacrosApi.deleteMacro('m1');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosDelete, 'm1');
  });

  it('attachMacroCsv → macrosAttachCsv with { content }', () => {
    void loginsMacrosApi.attachMacroCsv('a,b\n1,2');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosAttachCsv, { content: 'a,b\n1,2' });
  });

  it('runMacro → macrosRun with the input through bare', () => {
    const input = { macroId: 'm1', rows: [] } as never;
    void loginsMacrosApi.runMacro(input);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosRun, input);
  });

  it('runDraftMacro → macrosRunDraft with the input through bare', () => {
    const input = { steps: [] } as never;
    void loginsMacrosApi.runDraftMacro(input);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosRunDraft, input);
  });

  it('cancelMacro sends macrosCancel with the bare runId', () => {
    loginsMacrosApi.cancelMacro('run-3');
    expect(ipc.send).toHaveBeenCalledWith(IpcChannels.macrosCancel, 'run-3');
  });

  it('onMacroRunProgress subscribes, forwards only the payload, unsubscribes', () => {
    const cb = vi.fn();
    const off = loginsMacrosApi.onMacroRunProgress(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.macrosRunProgress, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({}, { runId: 'run-3', done: 2, total: 5 });
    expect(cb).toHaveBeenCalledWith({ runId: 'run-3', done: 2, total: 5 });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.macrosRunProgress, listener);
  });

  it('startMacroRecording → macrosRecordStart', () => {
    void loginsMacrosApi.startMacroRecording();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosRecordStart);
  });

  it('stopMacroRecording → macrosRecordStop', () => {
    void loginsMacrosApi.stopMacroRecording();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.macrosRecordStop);
  });

  it('onMacroRecordStep subscribes, forwards only the payload, unsubscribes', () => {
    const cb = vi.fn();
    const off = loginsMacrosApi.onMacroRecordStep(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.macrosRecordStep, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({}, { kind: 'click', selector: '#go' });
    expect(cb).toHaveBeenCalledWith({ kind: 'click', selector: '#go' });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.macrosRecordStep, listener);
  });

  it('onCursorPosition subscribes, forwards only the position, unsubscribes', () => {
    const cb = vi.fn();
    const off = loginsMacrosApi.onCursorPosition(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.cursorPosition, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({}, { x: 10, y: 20, visible: true });
    expect(cb).toHaveBeenCalledWith({ x: 10, y: 20, visible: true });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.cursorPosition, listener);
  });
});
