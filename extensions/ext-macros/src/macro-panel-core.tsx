import { useCallback, useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Macro, MacroRunProgress, MacroSummary, Step, StepErrorPolicy } from '@tepegoz/shared-types';
import { macrosDict } from './i18n';
import type { MacrosHostApi } from './types';
import {
  ADDABLE_KINDS,
  BTN,
  BTN_GHOST,
  DEFAULT_ELEMENT_TIMEOUT_MS,
  DEFAULT_LOAD_TIMEOUT_MS,
  DEFAULT_WAIT_MS,
  ERROR_POLICY_KINDS,
  FIELD,
  ICON_BTN,
  PRESS_KEYS,
  type AddableKind,
  cssChain,
  describeStep,
  emptyDraft,
  newStepOfKind,
} from './macro-step-helpers';

/** Shared stateful core — used by both the sidebar Studio and the internal page manager. */
export function MacrosCore({ api }: Readonly<{ api: MacrosHostApi }>) {
  const t = useT(macrosDict);
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Macro | null>(null);
  const [addKind, setAddKind] = useState<AddableKind>('waitMs');
  const [progress, setProgress] = useState<MacroRunProgress | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void api.listMacros().then(setMacros, () => undefined);
  }, [api]);

  useEffect(() => {
    refresh();
    const offStep = api.onMacroRecordStep((s) => {
      setDraft((prev) => (prev === null ? prev : { ...prev, steps: [...prev.steps, s.step] }));
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

  // ── draft mutations (all edit-without-saving) ──────────────────────────────────────────────────
  const patchSteps = (fn: (steps: Step[]) => Step[]): void =>
    setDraft((prev) => (prev === null ? prev : { ...prev, steps: fn([...prev.steps]) }));

  const updateStep = (i: number, next: Step): void =>
    patchSteps((steps) => {
      steps[i] = next;
      return steps;
    });
  // Set error-handling fields on an action step. Cast is sound: the control is only rendered for the
  // ERROR_POLICY_KINDS (browser-action steps that actually carry onError/retries in the IR).
  const setErrorPolicy = (i: number, s: Step, patch: { onError?: StepErrorPolicy; retries?: number }): void =>
    updateStep(i, { ...s, ...patch });
  const moveStep = (i: number, dir: -1 | 1): void =>
    patchSteps((steps) => {
      const j = i + dir;
      if (j < 0 || j >= steps.length) return steps;
      [steps[i], steps[j]] = [steps[j]!, steps[i]!];
      return steps;
    });
  const deleteStep = (i: number): void => patchSteps((steps) => steps.filter((_, k) => k !== i));
  const insertAfter = (i: number, step: Step): void =>
    patchSteps((steps) => {
      steps.splice(i + 1, 0, step);
      return steps;
    });
  const addStep = (kind: AddableKind): void => patchSteps((steps) => [...steps, newStepOfKind(kind)]);

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

  const STEP_LABELS: Record<AddableKind, string> = {
    navigate: t.stepNavigate,
    click: t.stepClick,
    fill: t.stepFill,
    press: t.stepPress,
    scroll: t.stepScroll,
    extract: t.stepExtract,
    setVar: t.stepSetVar,
    waitFor: t.stepWaitFor,
    waitLoad: t.stepWaitLoad,
    waitMs: t.stepWaitMs,
  };
  const stepTypeLabel = (kind: AddableKind): string => STEP_LABELS[kind];

  /** A CSS-selector text input bound to a step's `target[0].value` (used by click/fill/extract). */
  const selectorInput = (value: string, onValue: (v: string) => void) => (
    <input
      type="text"
      value={value}
      placeholder={t.selectorPlaceholder}
      aria-label={t.selector}
      onChange={(e) => onValue(e.target.value)}
      className={cn(FIELD, 'min-w-0 flex-1')}
    />
  );

  /** The editable body for one step row (inline field editors for the parameterised kinds). */
  function stepBody(step: Step, i: number) {
    if (step.kind === 'navigate') {
      return (
        <input
          type="url"
          value={step.url}
          aria-label={t.stepNavigate}
          onChange={(e) => updateStep(i, { kind: 'navigate', url: e.target.value })}
          className={cn(FIELD, 'min-w-0 flex-1')}
        />
      );
    }
    if (step.kind === 'click') {
      return selectorInput(step.target[0]?.value ?? '', (v) => updateStep(i, { kind: 'click', target: cssChain(v) }));
    }
    if (step.kind === 'fill') {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {selectorInput(step.target[0]?.value ?? '', (v) => updateStep(i, { ...step, target: cssChain(v) }))}
          <input
            type="text"
            value={step.value}
            placeholder={t.fillValue}
            aria-label={t.fillValue}
            onChange={(e) => updateStep(i, { ...step, value: e.target.value })}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
        </span>
      );
    }
    if (step.kind === 'press') {
      return (
        <span className="flex flex-1 items-center gap-1.5 text-text-primary">
          {t.stepPress}
          <select
            value={step.key}
            aria-label={t.key}
            onChange={(e) => updateStep(i, { kind: 'press', key: e.target.value })}
            className={cn(FIELD, 'w-32')}
          >
            {PRESS_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </span>
      );
    }
    if (step.kind === 'scroll') {
      return (
        <span className="flex flex-1 items-center gap-1.5 text-text-primary">
          {t.stepScroll}
          <select
            value={step.direction}
            aria-label={t.direction}
            onChange={(e) => updateStep(i, { ...step, direction: e.target.value === 'up' ? 'up' : 'down' })}
            className={cn(FIELD, 'w-24')}
          >
            <option value="down">{t.scrollDown}</option>
            <option value="up">{t.scrollUp}</option>
          </select>
        </span>
      );
    }
    if (step.kind === 'extract') {
      return (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
          {selectorInput(step.target[0]?.value ?? '', (v) => updateStep(i, { ...step, target: cssChain(v) }))}
          {'→'}
          <input
            type="text"
            value={step.into}
            placeholder={t.varName}
            aria-label={t.into}
            onChange={(e) => updateStep(i, { ...step, into: e.target.value })}
            className={cn(FIELD, 'w-24')}
          />
          <label className="flex items-center gap-1 text-text-secondary">
            <input
              type="checkbox"
              checked={step.append === true}
              aria-label={t.appendArray}
              onChange={(e) => updateStep(i, { ...step, append: e.target.checked })}
            />
            {t.appendArray}
          </label>
        </span>
      );
    }
    if (step.kind === 'setVar') {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-text-primary">
          <input
            type="text"
            value={step.name}
            placeholder={t.varName}
            aria-label={t.varName}
            onChange={(e) => updateStep(i, { ...step, name: e.target.value })}
            className={cn(FIELD, 'w-24')}
          />
          {'='}
          <input
            type="text"
            value={step.expr}
            placeholder={t.expression}
            aria-label={t.expression}
            onChange={(e) => updateStep(i, { ...step, expr: e.target.value })}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
        </span>
      );
    }
    if (step.kind === 'waitMs') {
      return (
        <span className="flex flex-1 items-center gap-1.5 text-text-primary">
          {t.waitLabel}
          <input
            type="number"
            min={1}
            value={step.ms}
            aria-label={t.durationMs}
            onChange={(e) => updateStep(i, { kind: 'waitMs', ms: Math.max(1, Number(e.target.value)) })}
            className={cn(FIELD, 'w-20')}
          />
          {'ms'}
        </span>
      );
    }
    if (step.kind === 'waitFor') {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-text-primary">
          {t.stepWaitFor}
          <input
            type="text"
            value={step.target[0]?.value ?? ''}
            placeholder={t.selectorPlaceholder}
            aria-label={t.stepWaitFor}
            onChange={(e) => updateStep(i, { kind: 'waitFor', target: [{ kind: 'css', value: e.target.value }], timeoutMs: step.timeoutMs })}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
          <input
            type="number"
            min={1}
            value={step.timeoutMs ?? DEFAULT_ELEMENT_TIMEOUT_MS}
            aria-label={t.durationMs}
            onChange={(e) => updateStep(i, { kind: 'waitFor', target: step.target, timeoutMs: Math.max(1, Number(e.target.value)) })}
            className={cn(FIELD, 'w-20')}
          />
          {'ms'}
        </span>
      );
    }
    if (step.kind === 'waitLoad') {
      return (
        <span className="flex flex-1 items-center gap-1.5 text-text-primary">
          {t.stepWaitLoad}
          <input
            type="number"
            min={1}
            value={step.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS}
            aria-label={t.durationMs}
            onChange={(e) => updateStep(i, { kind: 'waitLoad', timeoutMs: Math.max(1, Number(e.target.value)) })}
            className={cn(FIELD, 'w-24')}
          />
          {'ms'}
        </span>
      );
    }
    return <span className="min-w-0 flex-1 truncate font-mono text-text-primary">{describeStep(step)}</span>;
  }

  // ── Editor view (draft open) ───────────────────────────────────────────────────────────────────
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

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {t.steps} ({draft.steps.length})
            </h3>
            <span className="flex items-center gap-1">
              <select
                value={addKind}
                aria-label={t.addStep}
                onChange={(e) => setAddKind(e.target.value as AddableKind)}
                className={cn(FIELD, 'h-7')}
              >
                {ADDABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {stepTypeLabel(k)}
                  </option>
                ))}
              </select>
              <button type="button" className={ICON_BTN} onClick={() => addStep(addKind)}>
                {'+'} {t.addStep}
              </button>
            </span>
          </div>
          <ol className="space-y-1">
            {draft.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs">
                <span className="w-5 shrink-0 text-text-disabled">{i + 1}</span>
                {stepBody(s, i)}
                {ERROR_POLICY_KINDS.has(s.kind) && (
                  <span className="flex shrink-0 items-center gap-1">
                    <select
                      value={('onError' in s ? s.onError : undefined) ?? 'stop'}
                      aria-label={t.onError}
                      title={t.onError}
                      onChange={(e) => setErrorPolicy(i, s, { onError: e.target.value as StepErrorPolicy })}
                      className={cn(FIELD, 'w-16')}
                    >
                      <option value="stop">{t.onStop}</option>
                      <option value="skip">{t.onSkip}</option>
                      <option value="retry">{t.onRetry}</option>
                    </select>
                    {'onError' in s && s.onError === 'retry' && (
                      <input
                        type="number"
                        min={0}
                        value={s.retries ?? 0}
                        aria-label={t.retries}
                        title={t.retries}
                        onChange={(e) => setErrorPolicy(i, s, { retries: Math.max(0, Number(e.target.value)) })}
                        className={cn(FIELD, 'w-12')}
                      />
                    )}
                  </span>
                )}
                <span className="flex shrink-0 gap-1">
                  <button type="button" className={ICON_BTN} aria-label={t.moveUp} disabled={i === 0} onClick={() => moveStep(i, -1)}>
                    {'↑'}
                  </button>
                  <button type="button" className={ICON_BTN} aria-label={t.moveDown} disabled={i === draft.steps.length - 1} onClick={() => moveStep(i, 1)}>
                    {'↓'}
                  </button>
                  <button type="button" className={ICON_BTN} aria-label={t.insertWait} onClick={() => insertAfter(i, { kind: 'waitMs', ms: DEFAULT_WAIT_MS })}>
                    {'+⏱'}
                  </button>
                  <button type="button" className={ICON_BTN} aria-label={t.delete} onClick={() => deleteStep(i)}>
                    {'✕'}
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {draft.steps.length === 0 && <p className="text-sm text-text-secondary">{t.emptyDraft}</p>}
        </div>

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

  // ── List view ──────────────────────────────────────────────────────────────────────────────────
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
