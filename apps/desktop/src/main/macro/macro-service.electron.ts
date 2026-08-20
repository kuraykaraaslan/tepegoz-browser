import { randomUUID } from 'node:crypto';
import { AppError } from '@tepegoz/libs';
import type { Macro, Step } from '@tepegoz/shared-types';
import type { MacroRunInput, MacroRunProgress, MacroSummary } from '@tepegoz/desktop-ipc';
import { runMacro, type RunProgress } from '@tepegoz/macro-engine';
import type { MacroRunOutcome, MacrosCapabilityHost } from '@tepegoz/ext-macros/types';
import { parseCsv } from '@tepegoz/ext-macros/csv';
import { BlobStore, MacroStore, type Db } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import { createMacroHost } from './macro-host.electron';
import { healSelector } from './macro-selector-healer.electron';
import MacroRecorder from '../agent/macro-recorder.electron';
import TabManager from '../tabs';

/**
 * Main-process orchestrator for ext-macros: CRUD over `MacroStore`, CSV attachment via the
 * content-addressed `BlobStore`, deterministic run execution via `@tepegoz/macro-engine` (streaming
 * located progress), and the record→Step stream. Kept out of `ipc.ts` so that file stays lean. The
 * pure CSV parser lives in `@tepegoz/ext-macros/csv`.
 */

const runControllers = new Map<string, { aborted: boolean }>();

/** Bounded cache of finished-run outcomes so the agent's `macros_get_run` can look one up. */
const recentOutcomes = new Map<string, MacroRunOutcome>();
const MAX_RECENT = 50;

/** The app DB, or a 503 if it isn't ready yet (matches the other main services' guard). */
function db(): Db {
  const d = getDb();
  if (d === null) throw new AppError('Database not ready', 503);
  return d;
}

/** Map an engine progress event to the renderer wire shape (top-level step index only). */
function toWireProgress(runId: string, ev: RunProgress): MacroRunProgress {
  if (ev.phase === 'started') return { runId, phase: 'started', total: ev.total };
  if (ev.phase === 'step') return { runId, phase: 'step', index: ev.path[0] ?? 0, kind: ev.kind };
  if (ev.phase === 'done') return { runId, phase: 'done' };
  return { runId, phase: 'failed', failingStep: ev.path[0], detail: ev.detail };
}

export interface MacroCursorOpts {
  onCursorMove: (x: number, y: number) => void;
  onCursorHide: () => void;
}

/** Run an ALREADY-LOADED macro (saved or an unsaved draft) to completion; record + return outcome. */
async function executeMacro(
  macro: Macro,
  variables: Record<string, string> | undefined,
  runId: string,
  onProgress?: (ev: RunProgress) => void,
  cursorOpts?: MacroCursorOpts,
): Promise<MacroRunOutcome> {
  const signal = { aborted: false };
  runControllers.set(runId, signal);
  const host = createMacroHost({
    readCsv: (hash) => {
      const bytes = BlobStore.get(db(), hash);
      return Promise.resolve(bytes === undefined ? [] : parseCsv(bytes.toString('utf8')));
    },
    healSelector,
    ...(cursorOpts === undefined
      ? {}
      : { onCursorMove: cursorOpts.onCursorMove, onCursorHide: cursorOpts.onCursorHide }),
  });
  try {
    const result = await runMacro(macro, host, {
      variables,
      signal,
      ...(onProgress !== undefined ? { onProgress } : {}),
    });
    const outcome: MacroRunOutcome = {
      runId,
      ok: result.ok,
      aborted: result.aborted,
      stepsRun: result.stepsRun,
      error:
        result.error !== undefined
          ? { where: result.error.where, message: result.error.message }
          : undefined,
    };
    if (recentOutcomes.size >= MAX_RECENT) {
      const oldest = recentOutcomes.keys().next().value;
      if (oldest !== undefined) recentOutcomes.delete(oldest);
    }
    recentOutcomes.set(runId, outcome);
    return outcome;
  } finally {
    runControllers.delete(runId);
  }
}

/** Kick off a streaming run (fire-and-forget) and return its runId immediately. */
function startRun(
  macro: Macro,
  variables: Record<string, string> | undefined,
  emit: (p: MacroRunProgress) => void,
  cursorOpts?: MacroCursorOpts,
): string {
  const runId = randomUUID();
  void executeMacro(macro, variables, runId, (ev) => emit(toWireProgress(runId, ev)), cursorOpts);
  return runId;
}

const MacroService = {
  list(): MacroSummary[] {
    return MacroStore.list(db());
  },

  get(id: string): Macro | null {
    return MacroStore.get(db(), id);
  },

  save(macro: Macro): MacroSummary {
    MacroStore.save(db(), macro, Date.now());
    return { id: macro.id, name: macro.name, stepCount: macro.steps.length, updatedAt: Date.now() };
  },

  delete(id: string): void {
    MacroStore.delete(db(), id);
  },

  /** Store CSV text as a content-addressed blob; returns the bare hash referenced from a macro IR. */
  attachCsv(content: string): string {
    const ref = BlobStore.put(db(), Buffer.from(content, 'utf8'));
    return ref.startsWith('cas://') ? ref.slice('cas://'.length) : ref;
  },

  /** Start a saved-macro run; `emit` streams located progress to the renderer. Returns the runId. */
  run(input: MacroRunInput, emit: (p: MacroRunProgress) => void, cursorOpts?: MacroCursorOpts): string {
    const macro = MacroStore.get(db(), input.macroId);
    if (macro === null) throw new AppError(`Unknown macro: ${input.macroId}`, 404);
    return startRun(macro, input.variables, emit, cursorOpts);
  },

  /** Start an UNSAVED-DRAFT run (record/edit → play without persisting). Returns the runId. */
  runDraft(macro: Macro, variables: Record<string, string> | undefined, emit: (p: MacroRunProgress) => void, cursorOpts?: MacroCursorOpts): string {
    return startRun(macro, variables, emit, cursorOpts);
  },

  /** Run a saved macro to COMPLETION and resolve with the outcome (the agent-capability path). */
  runAwait(input: MacroRunInput): Promise<MacroRunOutcome> {
    const macro = MacroStore.get(db(), input.macroId);
    if (macro === null) throw new AppError(`Unknown macro: ${input.macroId}`, 404);
    return executeMacro(macro, input.variables, randomUUID());
  },

  /** The recorded outcome of a finished run, or null (bounded recent-runs cache). */
  getRunOutcome(runId: string): MacroRunOutcome | null {
    return recentOutcomes.get(runId) ?? null;
  },

  cancel(runId: string): void {
    const controller = runControllers.get(runId);
    if (controller !== undefined) controller.aborted = true;
  },

  /** Begin recording on the active tab; `onStep` streams each captured Step to the renderer. */
  async recordStart(onStep: (index: number, step: Step) => void): Promise<void> {
    const wc = TabManager.activeWebContents();
    if (wc === null) throw new AppError('No active tab to record', 409);
    let index = 0;
    await MacroRecorder.start(wc, (step) => {
      onStep(index, step);
      index++;
    });
  },

  recordStop(): Promise<void> {
    return MacroRecorder.stop();
  },

  /** The agent-capability host (ADR-0021): the same operations, shaped for `macrosCapabilities()`. */
  capabilityHost(): MacrosCapabilityHost {
    return {
      list: () => MacroService.list(),
      get: (id) => MacroService.get(id),
      save: (macro) => MacroService.save(macro),
      delete: (id) => MacroService.delete(id),
      run: (input) => MacroService.runAwait(input),
      getRun: (runId) => MacroService.getRunOutcome(runId),
    };
  },
};

export default MacroService;
