import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AutofillAvailablePayload,
  type LoginCredentialMeta,
  type LoginImportResult,
  type Macro,
  type MacroRecordedStep,
  type MacroRunDraftInput,
  type MacroRunInput,
  type MacroRunProgress,
  type MacroSummary,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Login credential manager + macros (ext-macros) bridge methods. Split out of `index.ts`
 *  (ADR-0010 250-line cap). */
export const loginsMacrosApi: Pick<
  TepegozApi,
  | 'listLogins'
  | 'setLogin'
  | 'removeLogin'
  | 'importLogins'
  | 'exportLogins'
  | 'onAutofillAvailable'
  | 'fillLogin'
  | 'listMacros'
  | 'getMacro'
  | 'saveMacro'
  | 'deleteMacro'
  | 'attachMacroCsv'
  | 'runMacro'
  | 'runDraftMacro'
  | 'cancelMacro'
  | 'onMacroRunProgress'
  | 'startMacroRecording'
  | 'stopMacroRecording'
  | 'onMacroRecordStep'
  | 'onCursorPosition'
> = {
  // Login credential manager. Raw secrets never cross this bridge — only metadata returns.
  listLogins: () => invoke<LoginCredentialMeta[]>(IpcChannels.loginsList),
  setLogin: (credential: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }) =>
    invoke<LoginCredentialMeta>(IpcChannels.loginsSet, {
      url: credential.url,
      username: credential.username,
      secret: credential.password,
      title: credential.title,
      notes: credential.notes,
    }),
  removeLogin: (id: string) => invoke<void>(IpcChannels.loginsRemove, id),
  importLogins: (data: string, format: string) =>
    invoke<LoginImportResult>(IpcChannels.loginsImport, { data, format }),
  exportLogins: (format: string) => invoke<string>(IpcChannels.loginsExport, format),
  onAutofillAvailable: (callback: (payload: AutofillAvailablePayload) => void) => {
    const listener = (_event: unknown, payload: AutofillAvailablePayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.loginsAutofillAvailable, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.loginsAutofillAvailable, listener);
    };
  },
  fillLogin: (credentialId: string) => {
    ipcRenderer.send(IpcChannels.loginsFill, { credentialId });
  },
  // Macros (ext-macros).
  listMacros: () => invoke<MacroSummary[]>(IpcChannels.macrosList),
  getMacro: (id: string) => invoke<Macro | null>(IpcChannels.macrosGet, id),
  saveMacro: (macro: Macro) => invoke<MacroSummary>(IpcChannels.macrosSave, macro),
  deleteMacro: (id: string) => invoke<void>(IpcChannels.macrosDelete, id),
  attachMacroCsv: (content: string) => invoke<string>(IpcChannels.macrosAttachCsv, { content }),
  runMacro: (input: MacroRunInput) => invoke<{ runId: string }>(IpcChannels.macrosRun, input),
  runDraftMacro: (input: MacroRunDraftInput) =>
    invoke<{ runId: string }>(IpcChannels.macrosRunDraft, input),
  cancelMacro: (runId: string) => {
    ipcRenderer.send(IpcChannels.macrosCancel, runId);
  },
  onMacroRunProgress: (callback: (progress: MacroRunProgress) => void) => {
    const listener = (_event: unknown, payload: MacroRunProgress): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.macrosRunProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.macrosRunProgress, listener);
    };
  },
  startMacroRecording: () => invoke<void>(IpcChannels.macrosRecordStart),
  stopMacroRecording: () => invoke<void>(IpcChannels.macrosRecordStop),
  onMacroRecordStep: (callback: (step: MacroRecordedStep) => void) => {
    const listener = (_event: unknown, payload: MacroRecordedStep): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.macrosRecordStep, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.macrosRecordStep, listener);
    };
  },
  onCursorPosition: (callback: (pos: { x: number; y: number; visible: boolean }) => void) => {
    const listener = (_event: unknown, pos: { x: number; y: number; visible: boolean }): void => {
      callback(pos);
    };
    ipcRenderer.on(IpcChannels.cursorPosition, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.cursorPosition, listener);
    };
  },
};
