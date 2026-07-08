import { useCallback, useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import {
  COMPARE_OPS,
  type CompareOp,
  type Macro,
  type MacroRunProgress,
  type MacroSummary,
  type Predicate,
  type Step,
  type StepErrorPolicy,
} from '@tepegoz/shared-types';
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
  defaultPredicate,
  describeStep,
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

const EDITABLE_PREDICATE_KINDS = [
  'textPresent',
  'textAbsent',
  'elementExists',
  'elementVisible',
  'varCompare',
] as const;
type EditablePredicateKind = (typeof EDITABLE_PREDICATE_KINDS)[number];

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
    assert: t.stepAssert,
    if: t.stepIf,
    repeat: t.stepRepeat,
    forEachRow: t.stepForEachRow,
  };
  const stepTypeLabel = (kind: AddableKind): string => STEP_LABELS[kind];

  const PREDICATE_LABELS: Record<EditablePredicateKind | 'advanced', string> = {
    textPresent: t.predTextPresent,
    textAbsent: t.predTextAbsent,
    elementExists: t.predElementExists,
    elementVisible: t.predElementVisible,
    varCompare: t.predVarCompare,
    advanced: t.predAdvanced,
  };

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

  function makePredicate(kind: EditablePredicateKind): Predicate {
    switch (kind) {
      case 'textPresent':
        return { kind, text: 'Success' };
      case 'textAbsent':
        return { kind, text: 'Error' };
      case 'elementExists':
      case 'elementVisible':
        return { kind, target: cssChain('body') };
      case 'varCompare':
        return { kind, left: 'x', op: 'eq', right: '""' };
    }
  }

  function describePredicate(predicate: Predicate): string {
    switch (predicate.kind) {
      case 'textPresent':
        return `${t.predTextPresent}: ${predicate.text}`;
      case 'textAbsent':
        return `${t.predTextAbsent}: ${predicate.text}`;
      case 'elementExists':
        return `${t.predElementExists}: ${predicate.target[0]?.value ?? ''}`;
      case 'elementVisible':
        return `${t.predElementVisible}: ${predicate.target[0]?.value ?? ''}`;
      case 'varCompare':
        return `${predicate.left} ${predicate.op} ${predicate.right}`;
      case 'and':
        return `and(${predicate.all.length})`;
      case 'or':
        return `or(${predicate.any.length})`;
      case 'not':
        return `not(${describePredicate(predicate.of)})`;
    }
  }

  function predicateEditor(predicate: Predicate, onChange: (next: Predicate) => void) {
    const editableKind = EDITABLE_PREDICATE_KINDS.includes(predicate.kind as EditablePredicateKind)
      ? (predicate.kind as EditablePredicateKind)
      : 'advanced';
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <select
          value={editableKind}
          aria-label={t.predicate}
          onChange={(e) => {
            if (e.target.value !== 'advanced') onChange(makePredicate(e.target.value as EditablePredicateKind));
          }}
          className={cn(FIELD, 'w-36')}
        >
          {editableKind === 'advanced' && <option value="advanced">{PREDICATE_LABELS.advanced}</option>}
          {EDITABLE_PREDICATE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PREDICATE_LABELS[kind]}
            </option>
          ))}
        </select>
        {predicate.kind === 'textPresent' || predicate.kind === 'textAbsent' ? (
          <input
            type="text"
            value={predicate.text}
            aria-label={t.predicate}
            onChange={(e) => onChange({ ...predicate, text: e.target.value })}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
        ) : null}
        {predicate.kind === 'elementExists' || predicate.kind === 'elementVisible'
          ? selectorInput(predicate.target[0]?.value ?? '', (v) => onChange({ ...predicate, target: cssChain(v) }))
          : null}
        {predicate.kind === 'varCompare' ? (
          <>
            <input
              type="text"
              value={predicate.left}
              placeholder={t.leftExpr}
              aria-label={t.leftExpr}
              onChange={(e) => onChange({ ...predicate, left: e.target.value })}
              className={cn(FIELD, 'w-24')}
            />
            <select
              value={predicate.op}
              aria-label={t.comparison}
              onChange={(e) => onChange({ ...predicate, op: e.target.value as CompareOp })}
              className={cn(FIELD, 'w-20')}
            >
              {COMPARE_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={predicate.right}
              placeholder={t.rightExpr}
              aria-label={t.rightExpr}
              onChange={(e) => onChange({ ...predicate, right: e.target.value })}
              className={cn(FIELD, 'w-24')}
            />
          </>
        ) : null}
        {editableKind === 'advanced' && (
          <span className="min-w-0 flex-1 truncate font-mono text-text-secondary">{describePredicate(predicate)}</span>
        )}
      </span>
    );
  }

  function updateAssertMessage(step: Extract<Step, { kind: 'assert' }>, location: StepLocation, message: string): void {
    const next: Step =
      message.length === 0
        ? { kind: 'assert', predicate: step.predicate, severity: step.severity }
        : { ...step, message };
    updateStep(location, next);
  }

  function updateForEachMaxRows(
    step: Extract<Step, { kind: 'forEachRow' }>,
    location: StepLocation,
    raw: string,
  ): void {
    const maxRows = raw.trim().length === 0 ? undefined : Math.max(1, Number(raw));
    const next: Step =
      maxRows === undefined
        ? { kind: 'forEachRow', csvBlobHash: step.csvBlobHash, as: step.as, onEnd: step.onEnd, body: step.body }
        : { ...step, maxRows };
    updateStep(location, next);
  }

  function stepBody(step: Step, location: StepLocation) {
    if (step.kind === 'navigate') {
      return (
        <input
          type="url"
          value={step.url}
          aria-label={t.stepNavigate}
          onChange={(e) => updateStep(location, { ...step, url: e.target.value })}
          className={cn(FIELD, 'min-w-0 flex-1')}
        />
      );
    }
    if (step.kind === 'click') {
      return selectorInput(step.target[0]?.value ?? '', (v) => updateStep(location, { ...step, target: cssChain(v) }));
    }
    if (step.kind === 'fill') {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {selectorInput(step.target[0]?.value ?? '', (v) => updateStep(location, { ...step, target: cssChain(v) }))}
          <input
            type="text"
            value={step.value}
            placeholder={t.fillValue}
            aria-label={t.fillValue}
            onChange={(e) => updateStep(location, { ...step, value: e.target.value })}
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
            onChange={(e) => updateStep(location, { ...step, key: e.target.value })}
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
            onChange={(e) => updateStep(location, { ...step, direction: e.target.value === 'up' ? 'up' : 'down' })}
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
          {selectorInput(step.target[0]?.value ?? '', (v) => updateStep(location, { ...step, target: cssChain(v) }))}
          {'→'}
          <input
            type="text"
            value={step.into}
            placeholder={t.varName}
            aria-label={t.into}
            onChange={(e) => updateStep(location, { ...step, into: e.target.value })}
            className={cn(FIELD, 'w-24')}
          />
          <label className="flex items-center gap-1 text-text-secondary">
            <input
              type="checkbox"
              checked={step.append === true}
              aria-label={t.appendArray}
              onChange={(e) => updateStep(location, { ...step, append: e.target.checked })}
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
            onChange={(e) => updateStep(location, { ...step, name: e.target.value })}
            className={cn(FIELD, 'w-24')}
          />
          {'='}
          <input
            type="text"
            value={step.expr}
            placeholder={t.expression}
            aria-label={t.expression}
            onChange={(e) => updateStep(location, { ...step, expr: e.target.value })}
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
            onChange={(e) => updateStep(location, { kind: 'waitMs', ms: Math.max(1, Number(e.target.value)) })}
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
            onChange={(e) => updateStep(location, { ...step, target: [{ kind: 'css', value: e.target.value }] })}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
          <input
            type="number"
            min={1}
            value={step.timeoutMs ?? DEFAULT_ELEMENT_TIMEOUT_MS}
            aria-label={t.durationMs}
            onChange={(e) => updateStep(location, { ...step, timeoutMs: Math.max(1, Number(e.target.value)) })}
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
            onChange={(e) => updateStep(location, { ...step, timeoutMs: Math.max(1, Number(e.target.value)) })}
            className={cn(FIELD, 'w-24')}
          />
          {'ms'}
        </span>
      );
    }
    if (step.kind === 'assert') {
      return (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
          {t.stepAssert}
          {predicateEditor(step.predicate, (predicate) => updateStep(location, { ...step, predicate }))}
          <select
            value={step.severity}
            aria-label={t.severity}
            onChange={(e) => updateStep(location, { ...step, severity: e.target.value === 'soft' ? 'soft' : 'hard' })}
            className={cn(FIELD, 'w-20')}
          >
            <option value="hard">{t.severityHard}</option>
            <option value="soft">{t.severitySoft}</option>
          </select>
          <input
            type="text"
            value={step.message ?? ''}
            placeholder={t.assertMessage}
            aria-label={t.assertMessage}
            onChange={(e) => updateAssertMessage(step, location, e.target.value)}
            className={cn(FIELD, 'min-w-0 flex-1')}
          />
        </span>
      );
    }
    if (step.kind === 'if') {
      return (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
          {t.stepIf}
          {predicateEditor(step.cond, (cond) => updateStep(location, { ...step, cond }))}
        </span>
      );
    }
    if (step.kind === 'repeat') {
      const mode = step.count !== undefined ? 'count' : 'while';
      return (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
          {t.stepRepeat}
          <select
            value={mode}
            aria-label={t.repeatMode}
            onChange={(e) =>
              updateStep(
                location,
                e.target.value === 'count'
                  ? { kind: 'repeat', count: 3, body: step.body }
                  : { kind: 'repeat', while: defaultPredicate(), body: step.body },
              )
            }
            className={cn(FIELD, 'w-24')}
          >
            <option value="count">{t.repeatCount}</option>
            <option value="while">{t.repeatWhile}</option>
          </select>
          {step.count !== undefined ? (
            <input
              type="number"
              min={1}
              value={step.count}
              aria-label={t.count}
              onChange={(e) => updateStep(location, { kind: 'repeat', count: Math.max(1, Number(e.target.value)), body: step.body })}
              className={cn(FIELD, 'w-20')}
            />
          ) : (
            predicateEditor(step.while ?? defaultPredicate(), (predicate) =>
              updateStep(location, { kind: 'repeat', while: predicate, body: step.body }),
            )
          )}
        </span>
      );
    }
    if (step.kind === 'forEachRow') {
      const key = stepLocationKey(location);
      const csvText = csvInputs[key] ?? '';
      return (
        <span className="flex min-w-0 flex-1 flex-col gap-1 text-text-primary">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {t.stepForEachRow}
            <input
              type="text"
              value={step.csvBlobHash}
              placeholder={t.csvHash}
              aria-label={t.csvHash}
              onChange={(e) => updateStep(location, { ...step, csvBlobHash: e.target.value })}
              className={cn(FIELD, 'min-w-0 flex-1')}
            />
            <input
              type="text"
              value={step.as}
              placeholder={t.csvVar}
              aria-label={t.csvVar}
              onChange={(e) => updateStep(location, { ...step, as: e.target.value })}
              className={cn(FIELD, 'w-20')}
            />
            <select
              value={step.onEnd}
              aria-label={t.csvOnEnd}
              onChange={(e) => updateStep(location, { ...step, onEnd: e.target.value === 'restart' ? 'restart' : 'stop' })}
              className={cn(FIELD, 'w-24')}
            >
              <option value="stop">{t.csvStop}</option>
              <option value="restart">{t.csvRestart}</option>
            </select>
            <input
              type="number"
              min={1}
              value={step.maxRows ?? ''}
              placeholder={t.csvMaxRows}
              aria-label={t.csvMaxRows}
              onChange={(e) => updateForEachMaxRows(step, location, e.target.value)}
              className={cn(FIELD, 'w-20')}
            />
          </span>
          <span className="flex min-w-0 items-start gap-1.5">
            <textarea
              value={csvText}
              placeholder={t.csvContent}
              aria-label={t.csvContent}
              onChange={(e) => setCsvInputs((prev) => ({ ...prev, [key]: e.target.value }))}
              className={cn(FIELD, 'h-14 min-w-0 flex-1 py-1')}
            />
            <button
              type="button"
              className={ICON_BTN}
              onClick={() => void attachCsv(location, step)}
              disabled={csvText.trim().length === 0}
            >
              {t.csvAttach}
            </button>
          </span>
        </span>
      );
    }
    return <span className="min-w-0 flex-1 truncate font-mono text-text-primary">{describeStep(step)}</span>;
  }

  function renderStepChildren(step: Step, location: StepLocation, depth: number) {
    if (step.kind === 'if') {
      const thenPath: StepContainerPath = [...location.containerPath, { index: location.index, slot: 'then' }];
      const elsePath: StepContainerPath = [...location.containerPath, { index: location.index, slot: 'else' }];
      return (
        <div className="mt-2 space-y-2 border-l border-border pl-3">
          {renderStepList(step.then, thenPath, t.thenBranch, depth + 1)}
          {renderStepList(step.else ?? [], elsePath, t.elseBranch, depth + 1)}
        </div>
      );
    }
    if (step.kind === 'repeat' || step.kind === 'forEachRow') {
      const bodyPath: StepContainerPath = [...location.containerPath, { index: location.index, slot: 'body' }];
      return <div className="mt-2 border-l border-border pl-3">{renderStepList(step.body, bodyPath, t.bodyBranch, depth + 1)}</div>;
    }
    return null;
  }

  function renderStepList(steps: readonly Step[], containerPath: StepContainerPath, label: string, depth = 0) {
    const isTopLevel = containerPath.length === 0;
    return (
      <div className={cn(!isTopLevel && 'rounded-md bg-surface-base/40 p-2')}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {label} ({steps.length})
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
            <button type="button" className={ICON_BTN} onClick={() => addStep(containerPath, addKind)}>
              {'+'} {t.addStep}
            </button>
          </span>
        </div>
        <ol className="space-y-1">
          {steps.map((s, i) => {
            const location: StepLocation = { containerPath, index: i };
            return (
              <li key={stepLocationKey(location)} className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-text-disabled">{i + 1}</span>
                  {stepBody(s, location)}
                  {ERROR_POLICY_KINDS.has(s.kind) && (
                    <span className="flex shrink-0 items-center gap-1">
                      <select
                        value={('onError' in s ? s.onError : undefined) ?? 'stop'}
                        aria-label={t.onError}
                        title={t.onError}
                        onChange={(e) => setErrorPolicy(location, { onError: e.target.value as StepErrorPolicy })}
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
                          onChange={(e) => setErrorPolicy(location, { retries: Math.max(0, Number(e.target.value)) })}
                          className={cn(FIELD, 'w-12')}
                        />
                      )}
                    </span>
                  )}
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className={ICON_BTN} aria-label={t.moveUp} disabled={i === 0} onClick={() => moveStep(location, -1)}>
                      {'↑'}
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={t.moveDown} disabled={i === steps.length - 1} onClick={() => moveStep(location, 1)}>
                      {'↓'}
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={t.insertWait} onClick={() => insertAfter(location, { kind: 'waitMs', ms: DEFAULT_WAIT_MS })}>
                      {'+⏱'}
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={t.delete} onClick={() => deleteStep(location)}>
                      {'✕'}
                    </button>
                  </span>
                </div>
                {renderStepChildren(s, location, depth)}
              </li>
            );
          })}
        </ol>
        {steps.length === 0 && <p className="text-sm text-text-secondary">{isTopLevel ? t.emptyDraft : t.emptyBranch}</p>}
      </div>
    );
  }

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

        {renderStepList(draft.steps, [], t.steps)}

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
