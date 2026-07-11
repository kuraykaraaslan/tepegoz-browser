import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { cn } from '@tepegoz/ui';
import type { Step } from '@tepegoz/shared-types';
import type { MacrosStrings } from './i18n';
import { FIELD, ICON_BTN, defaultPredicate } from './macro-step-helpers';
import { type StepLocation, stepLocationKey } from './macro-step-tree';
import { predicateEditor } from './macro-panel-core-predicate';

/** CSV draft state + attach handler threaded into the `forEachRow` editor. */
export interface CsvHandlers {
  csvInputs: Record<string, string>;
  setCsvInputs: Dispatch<SetStateAction<Record<string, string>>>;
  attachCsv: (location: StepLocation, step: Extract<Step, { kind: 'forEachRow' }>) => void | Promise<void>;
}

function updateAssertMessage(
  updateStep: (location: StepLocation, next: Step) => void,
  step: Extract<Step, { kind: 'assert' }>,
  location: StepLocation,
  message: string,
): void {
  const next: Step =
    message.length === 0
      ? { kind: 'assert', predicate: step.predicate, severity: step.severity }
      : { ...step, message };
  updateStep(location, next);
}

function updateForEachMaxRows(
  updateStep: (location: StepLocation, next: Step) => void,
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

/** Editors for the control-flow steps. Returns `null` for leaf action kinds handled elsewhere. */
export function flowStepBody(
  t: MacrosStrings,
  step: Step,
  location: StepLocation,
  updateStep: (location: StepLocation, next: Step) => void,
  csv: CsvHandlers,
): ReactNode | null {
  if (step.kind === 'assert') {
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
        {t.stepAssert}
        {predicateEditor(t, step.predicate, (predicate) => updateStep(location, { ...step, predicate }))}
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
          onChange={(e) => updateAssertMessage(updateStep, step, location, e.target.value)}
          className={cn(FIELD, 'min-w-0 flex-1')}
        />
      </span>
    );
  }
  if (step.kind === 'if') {
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-text-primary">
        {t.stepIf}
        {predicateEditor(t, step.cond, (cond) => updateStep(location, { ...step, cond }))}
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
          predicateEditor(t, step.while ?? defaultPredicate(), (predicate) =>
            updateStep(location, { kind: 'repeat', while: predicate, body: step.body }),
          )
        )}
      </span>
    );
  }
  if (step.kind === 'forEachRow') {
    const key = stepLocationKey(location);
    const csvText = csv.csvInputs[key] ?? '';
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
            onChange={(e) => updateForEachMaxRows(updateStep, step, location, e.target.value)}
            className={cn(FIELD, 'w-20')}
          />
        </span>
        <span className="flex min-w-0 items-start gap-1.5">
          <textarea
            value={csvText}
            placeholder={t.csvContent}
            aria-label={t.csvContent}
            onChange={(e) => csv.setCsvInputs((prev) => ({ ...prev, [key]: e.target.value }))}
            className={cn(FIELD, 'h-14 min-w-0 flex-1 py-1')}
          />
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => void csv.attachCsv(location, step)}
            disabled={csvText.trim().length === 0}
          >
            {t.csvAttach}
          </button>
        </span>
      </span>
    );
  }
  return null;
}
