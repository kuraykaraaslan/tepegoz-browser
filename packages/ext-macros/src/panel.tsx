import { useCallback, useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { MACRO_IR_VERSION, type Macro, type MacroRunProgress, type MacroSummary, type Step, type StepErrorPolicy } from '@tepegoz/shared-types';
import { macrosDict } from './i18n';
import type { MacrosHostApi } from './types';

export interface MacrosSurfaceProps {
  api: MacrosHostApi;
  onClose: () => void;
}

const BTN =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary hover:opacity-90 ' +
  'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay ' +
  'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const ICON_BTN =
  'rounded border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-overlay ' +
  'hover:text-text-primary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const FIELD =
  'h-7 rounded border border-border bg-surface-base px-1.5 text-xs text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

const DEFAULT_WAIT_MS = 500;
const DEFAULT_ELEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const uuid = (): string => crypto.randomUUID();

/** Named keys the `press` step supports (mirrors the engine/CDP KEY_MAP). */
const PRESS_KEYS = [
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Space',
] as const;

/** The step kinds the editor can add from scratch (recorded macros may contain any kind). */
const ADDABLE_KINDS = [
  'navigate', 'click', 'fill', 'press', 'scroll', 'extract', 'setVar', 'waitFor', 'waitLoad', 'waitMs',
] as const;
type AddableKind = (typeof ADDABLE_KINDS)[number];

/** A single-CSS-candidate selector chain (the editor authors CSS; recordings keep richer chains). */
const cssChain = (value: string) => [{ kind: 'css' as const, value }];

/** Step kinds that carry a per-step error policy (browser actions). */
const ERROR_POLICY_KINDS = new Set<Step['kind']>([
  'navigate', 'click', 'fill', 'press', 'scroll', 'extract', 'waitFor', 'waitLoad',
]);

function newStepOfKind(kind: AddableKind): Step {
  switch (kind) {
    case 'navigate':
      return { kind: 'navigate', url: 'https://' };
    case 'click':
      return { kind: 'click', target: cssChain('') };
    case 'fill':
      return { kind: 'fill', target: cssChain(''), value: '' };
    case 'press':
      return { kind: 'press', key: 'Enter' };
    case 'scroll':
      return { kind: 'scroll', direction: 'down' };
    case 'extract':
      return { kind: 'extract', target: cssChain(''), into: 'result' };
    case 'setVar':
      return { kind: 'setVar', name: 'x', expr: '' };
    case 'waitFor':
      return { kind: 'waitFor', target: cssChain(''), timeoutMs: DEFAULT_ELEMENT_TIMEOUT_MS };
    case 'waitLoad':
      return { kind: 'waitLoad', timeoutMs: DEFAULT_LOAD_TIMEOUT_MS };
    case 'waitMs':
      return { kind: 'waitMs', ms: DEFAULT_WAIT_MS };
  }
}


/** A one-line human summary of a step (read-only rows / nested bodies). */
function describeStep(step: Step): string {
  switch (step.kind) {
    case 'navigate':
      return `navigate → ${step.url}`;
    case 'click':
      return `click ${step.target[0]?.value ?? ''}`;
    case 'fill':
      return `fill ${step.target[0]?.value ?? ''} = ${step.value}`;
    case 'press':
      return `press ${step.key}`;
    case 'scroll':
      return `scroll ${step.direction}`;
    case 'extract':
      return `extract → ${step.into}`;
    case 'waitFor':
      return `waitFor ${step.target[0]?.value ?? ''}`;
    case 'waitLoad':
      return `waitLoad`;
    case 'waitMs':
      return `wait ${step.ms}ms`;
    case 'assert':
      return `assert (${step.severity})`;
    case 'setVar':
      return `set ${step.name} = ${step.expr}`;
    case 'if':
      return `if … (${step.then.length} then)`;
    case 'repeat':
      return `repeat ${step.count ?? 'while'} …`;
    case 'forEachRow':
      return `forEachRow ${step.as} (${step.onEnd})`;
  }
}

function emptyDraft(): Macro {
  return { id: uuid(), name: '', version: MACRO_IR_VERSION, variables: [], steps: [] };
}

/** Shared stateful core — used by both the sidebar Studio and the internal page manager. */
function MacrosCore({ api }: Readonly<{ api: MacrosHostApi }>) {
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

/** Sidebar surface — "Macro Studio" (record + edit + run beside the visible page). */
export function MacrosPanel({ api, onClose }: MacrosSurfaceProps) {
  const t = useT(macrosDict);
  const c = useT(coreDict);
  return (
    <div className="flex h-full w-full flex-col bg-surface-base text-text-primary">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">{t.studioTitle}</h2>
        <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
          {c.window.close}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <MacrosCore api={api} />
      </div>
    </div>
  );
}

/** Page surface — "My Macros" at tepegoz://com.tepegoz.macros. */
export function MacrosPage({ api }: MacrosSurfaceProps) {
  const t = useT(macrosDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-2xl text-base font-semibold">{t.managerTitle}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-sm text-text-secondary">{t.description}</p>
          <MacrosCore api={api} />
        </div>
      </div>
    </div>
  );
}
