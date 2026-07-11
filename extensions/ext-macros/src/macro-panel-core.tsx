import { useCallback, useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import {
  type Macro,
  type MacroRunProgress,
  type MacroSummary,
  type Step,
  type StepErrorPolicy,
} from '@tepegoz/shared-types';
import { macrosDict } from './i18n';
import type { MacrosHostApi } from './types';
import {
  BTN,
  BTN_GHOST,
  type AddableKind,
  emptyDraft,
  newStepOfKind,
} from './macro-step-helpers';
import {
  appendStepToContainer,
  deleteStepAtLocation,
  insertStepAfterLocation,
  moveStepAtLocation,
  stepLocationKey,
  type StepContainerPath,
  type StepLocation,
  updateStepAtLocation,
} from './macro-step-tree';
import { StepList, type StepListHandlers } from './macro-panel-core-step-list';

/** Shared stateful core — used by both the sidebar Studio and the internal page manager. */
export function MacrosCore({ api }: Readonly<{ api: MacrosHostApi }>) {
  const t = useT(macrosDict);
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Macro | null>(null);
  const [addKind, setAddKind] = useState<AddableKind>('waitMs');
  const [progress, setProgress] = useState<MacroRunProgress | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [csvInputs, setCsvInputs] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    void api.listMacros().then(setMacros, () => undefined);
  }, [api]);

  useEffect(() => {
    refresh();
    const offStep = api.onMacroRecordStep((s) => {
      setDraft((prev) => (prev === null ? prev : { ...prev, steps: appendStepToContainer(prev.steps, [], s.step) }));
    });
    const offRun = api.onMacroRunProgress((p) => {
      setProgress(p);
      if (p.phase === 'done' || p.phase === 'failed') {
        setRunId(null);
        refresh();
      }
    });
    return () => {
      offStep();
      offRun();
    };
  }, [api, refresh]);

  // -- draft mutations (all edit-without-saving) --------------------------------------------------
  const patchSteps = (fn: (steps: readonly Step[]) => Step[]): void =>
    setDraft((prev) => (prev === null ? prev : { ...prev, steps: fn(prev.steps) }));

  const updateStep = (location: StepLocation, next: Step): void =>
    patchSteps((steps) => updateStepAtLocation(steps, location, () => next));

  const patchStep = (location: StepLocation, fn: (step: Step) => Step): void =>
    patchSteps((steps) => updateStepAtLocation(steps, location, fn));

  const setErrorPolicy = (location: StepLocation, patch: { onError?: StepErrorPolicy; retries?: number }): void =>
    patchStep(location, (step) => ({ ...step, ...patch }));

  const moveStep = (location: StepLocation, dir: -1 | 1): void =>
    patchSteps((steps) => moveStepAtLocation(steps, location, dir));

  const deleteStep = (location: StepLocation): void =>
    patchSteps((steps) => deleteStepAtLocation(steps, location));

  const insertAfter = (location: StepLocation, step: Step): void =>
    patchSteps((steps) => insertStepAfterLocation(steps, location, step));

  const addStep = (containerPath: StepContainerPath, kind: AddableKind): void =>
    patchSteps((steps) => appendStepToContainer(steps, containerPath, newStepOfKind(kind)));

  async function attachCsv(location: StepLocation, step: Extract<Step, { kind: 'forEachRow' }>): Promise<void> {
    const key = stepLocationKey(location);
    const content = csvInputs[key] ?? '';
    if (content.trim().length === 0) return;
    const hash = await api.attachMacroCsv(content);
    updateStep(location, { ...step, csvBlobHash: hash });
    setCsvInputs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const stepHandlers: StepListHandlers = {
    addKind,
    setAddKind,
    updateStep,
    setErrorPolicy,
    moveStep,
    deleteStep,
    insertAfter,
    addStep,
    csv: { csvInputs, setCsvInputs, attachCsv },
  };

  async function toggleRecord(): Promise<void> {
    if (recording) {
      await api.stopMacroRecording().catch(() => undefined);
      setRecording(false);
    } else {
      if (draft === null) setDraft(emptyDraft());
      await api.startMacroRecording().catch(() => undefined);
      setRecording(true);
    }
  }
  async function stopIfRecording(): Promise<void> {
    if (recording) {
      await api.stopMacroRecording().catch(() => undefined);
      setRecording(false);
    }
  }

  async function runDraft(): Promise<void> {
    if (draft === null || draft.steps.length === 0) return;
    await stopIfRecording();
    setProgress(null);
    const res = await api.runDraftMacro({ macro: draft }).catch(() => null);
    if (res !== null) setRunId(res.runId);
  }
  async function saveDraft(): Promise<void> {
    if (draft === null || draft.name.trim().length === 0 || draft.steps.length === 0) return;
    await stopIfRecording();
    await api.saveMacro({ ...draft, name: draft.name.trim() });
    setDraft(null);
    refresh();
  }
  async function editSaved(id: string): Promise<void> {
    const macro = await api.getMacro(id).catch(() => null);
    if (macro !== null) setDraft(macro);
  }
  async function runSaved(id: string): Promise<void> {
    setProgress(null);
    const res = await api.runMacro({ macroId: id }).catch(() => null);
    if (res !== null) setRunId(res.runId);
  }
  function remove(id: string): void {
    void api.deleteMacro(id).then(refresh, () => undefined);
  }

  const progressLine =
    progress === null ? null : (
      <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-secondary">
        {progress.phase === 'started' && `${t.running} (0/${progress.total})`}
        {progress.phase === 'step' && `${t.runStep} ${progress.index + 1}: ${progress.kind}`}
        {progress.phase === 'done' && t.runDone}
        {progress.phase === 'failed' &&
          `${t.runFailed} — ${t.failedAt} ${(progress.failingStep ?? 0) + 1}: ${progress.detail}`}
      </p>
    );

  // -- Editor view (draft open) --------------------------------------------------------------------
  if (draft !== null) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_GHOST} onClick={() => void stopIfRecording().then(() => setDraft(null))}>
            {'←'} {t.cancel}
          </button>
          <button type="button" className={cn(BTN, recording && 'ring-2 ring-red-500')} onClick={() => void toggleRecord()}>
            {recording ? t.stopRecording : t.record}
          </button>
          {recording && <span className="text-xs text-red-500">{t.recording}</span>}
        </div>

        <input
          type="text"
          value={draft.name}
          placeholder={t.namePlaceholder}
          aria-label={t.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />

        <StepList steps={draft.steps} containerPath={[]} label={t.steps} h={stepHandlers} />

        {progressLine}

        <div className="flex gap-2">
          <button type="button" className={BTN} onClick={() => void runDraft()} disabled={draft.steps.length === 0 || runId !== null}>
            {t.run}
          </button>
          {runId !== null && (
            <button type="button" className={BTN_GHOST} onClick={() => api.cancelMacro(runId)}>
              {t.cancel}
            </button>
          )}
          <button type="button" className={BTN_GHOST} onClick={() => void saveDraft()} disabled={draft.name.trim().length === 0 || draft.steps.length === 0}>
            {t.save}
          </button>
        </div>
      </div>
    );
  }

  // -- List view -----------------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className={BTN} onClick={() => void toggleRecord()}>
          {t.record}
        </button>
        <button type="button" className={BTN_GHOST} onClick={() => setDraft(emptyDraft())}>
          {'+'} {t.newMacro}
        </button>
      </div>

      {progressLine}

      <div>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">{t.steps}</h3>
        {macros.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {macros.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">{m.name}</span>
                  <span className="text-xs text-text-secondary">
                    {m.stepCount} {t.stepsCount}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" className={BTN} onClick={() => void runSaved(m.id)} disabled={runId !== null}>
                    {t.run}
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => void editSaved(m.id)}>
                    {t.edit}
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => remove(m.id)}>
                    {t.delete}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
