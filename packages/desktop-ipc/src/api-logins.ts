/**
 * Login-manager + macros slice of {@link TepegozApi}. Type-only imports keep this dependency-free for
 * the sandboxed preload; composed into the full surface by `api.ts`.
 */
import type { LoginCredentialMeta, LoginImportResult, AutofillAvailablePayload } from './contract';
import type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
} from './contract';

export interface LoginsApi {
  // Login credential manager (logins:* channels). Encrypted on disk; raw secrets never cross IPC.
  /** All stored login metadata (no passwords). */
  listLogins(): Promise<LoginCredentialMeta[]>;
  /** Save a new or updated login. The raw password is encrypted in main immediately on arrival. */
  setLogin(credential: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }): Promise<LoginCredentialMeta>;
  removeLogin(id: string): Promise<void>;
  importLogins(data: string, format: string): Promise<LoginImportResult>;
  exportLogins(format: string): Promise<string>;
  /** Subscribe to autofill-available pushes (main → renderer on page load). Returns unsubscribe fn. */
  onAutofillAvailable(callback: (payload: AutofillAvailablePayload) => void): () => void;
  /** Fill the selected credential into the active tab's page form. Main decrypts; nothing returns. */
  fillLogin(credentialId: string): void;
  // Macros (ext-macros): CRUD + CSV attach, deterministic run + record, with streamed events.
  listMacros(): Promise<MacroSummary[]>;
  getMacro(id: string): Promise<Macro | null>;
  /** Save (upsert) a macro; the IR is validated by MacroSchema in main. Returns its summary. */
  saveMacro(macro: Macro): Promise<MacroSummary>;
  deleteMacro(id: string): Promise<void>;
  /** Store CSV text as a content-addressed blob; returns the hash to reference from a `forEachRow`. */
  attachMacroCsv(content: string): Promise<string>;
  /** Start a saved-macro run; progress streams via {@link onMacroRunProgress}. Returns the runId. */
  runMacro(input: MacroRunInput): Promise<{ runId: string }>;
  /** Run an UNSAVED macro IR directly (record/edit → play without persisting). */
  runDraftMacro(input: MacroRunDraftInput): Promise<{ runId: string }>;
  cancelMacro(runId: string): void;
  /** Subscribe to run progress (started/step/done/failed). Returns an unsubscribe function. */
  onMacroRunProgress(callback: (progress: MacroRunProgress) => void): () => void;
  /** Begin recording the active tab; captured steps stream via {@link onMacroRecordStep}. */
  startMacroRecording(): Promise<void>;
  stopMacroRecording(): Promise<void>;
  /** Subscribe to captured steps while recording. Returns an unsubscribe function. */
  onMacroRecordStep(callback: (step: MacroRecordedStep) => void): () => void;
  /** Subscribe to simulated cursor-position updates during a macro/agent run. Returns unsubscribe fn.
   *  Coordinates are shell-window-relative (CSS px, position:fixed space). `visible:false` = idle. */
  onCursorPosition(callback: (pos: { x: number; y: number; visible: boolean }) => void): () => void;
}
