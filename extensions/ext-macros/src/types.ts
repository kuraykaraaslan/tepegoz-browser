import type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
} from '@tepegoz/shared-types';

/**
 * The host contract the Macros surfaces depend on — structurally a subset of `window.tepegoz`
 * (injected as `api`, never reached globally). Keeps the extension package decoupled + testable.
 */
export interface MacrosHostApi {
  listMacros(): Promise<MacroSummary[]>;
  getMacro(id: string): Promise<Macro | null>;
  saveMacro(macro: Macro): Promise<MacroSummary>;
  deleteMacro(id: string): Promise<void>;
  attachMacroCsv(content: string): Promise<string>;
  runMacro(input: MacroRunInput): Promise<{ runId: string }>;
  /** Run an unsaved macro IR directly (record/edit → play without persisting). */
  runDraftMacro(input: MacroRunDraftInput): Promise<{ runId: string }>;
  cancelMacro(runId: string): void;
  onMacroRunProgress(callback: (progress: MacroRunProgress) => void): () => void;
  startMacroRecording(): Promise<void>;
  stopMacroRecording(): Promise<void>;
  onMacroRecordStep(callback: (step: MacroRecordedStep) => void): () => void;
}

/**
 * The host contract the AGENT capabilities (`capabilities.ts`) run against — implemented in the main
 * process over the macro service, and injected by the capability supervisor (ADR-0021). Distinct from
 * {@link MacrosHostApi}: it runs a macro to completion (for the agent), rather than streaming to a UI.
 */
export interface MacrosCapabilityHost {
  list(): MacroSummary[];
  get(id: string): Macro | null;
  save(macro: Macro): MacroSummary;
  delete(id: string): void;
  /** Run a macro to completion; resolves with the outcome (ok + located error if it failed). */
  run(input: MacroRunInput): Promise<MacroRunOutcome>;
  /** The recorded outcome of a finished run, or null if unknown. */
  getRun(runId: string): MacroRunOutcome | null;
}

/** The terminal result of an agent-driven macro run (no streaming). */
export interface MacroRunOutcome {
  runId: string;
  ok: boolean;
  aborted: boolean;
  stepsRun: number;
  /** Present when the run failed: the exact failing step + message (never an opaque code). */
  error?: { where: string; message: string } | undefined;
}
