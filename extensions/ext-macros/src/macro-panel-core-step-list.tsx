import type { ReactNode } from 'react';
import { cn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Step, StepErrorPolicy } from '@tepegoz/shared-types';
import { macrosDict } from './i18n';
import {
  ADDABLE_KINDS,
  DEFAULT_WAIT_MS,
  ERROR_POLICY_KINDS,
  FIELD,
  ICON_BTN,
  type AddableKind,
  describeStep,
} from './macro-step-helpers';
import { type StepContainerPath, type StepLocation, stepLocationKey } from './macro-step-tree';
import { fieldStepBody } from './macro-panel-core-field-steps';
import { type CsvHandlers, flowStepBody } from './macro-panel-core-flow-steps';

/** Draft-mutation callbacks the recursive step list needs to render and edit steps. */
export interface StepListHandlers {
  addKind: AddableKind;
  setAddKind: (kind: AddableKind) => void;
  updateStep: (location: StepLocation, next: Step) => void;
  setErrorPolicy: (
    location: StepLocation,
    patch: { onError?: StepErrorPolicy; retries?: number },
  ) => void;
  moveStep: (location: StepLocation, dir: -1 | 1) => void;
  deleteStep: (location: StepLocation) => void;
  insertAfter: (location: StepLocation, step: Step) => void;
  addStep: (containerPath: StepContainerPath, kind: AddableKind) => void;
  csv: CsvHandlers;
}

export function StepList({
  steps,
  containerPath,
  label,
  depth = 0,
  h,
}: Readonly<{
  steps: readonly Step[];
  containerPath: StepContainerPath;
  label: string;
  depth?: number;
  h: StepListHandlers;
}>) {
  const t = useT(macrosDict);

  const stepLabels: Record<AddableKind, string> = {
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
  const stepTypeLabel = (kind: AddableKind): string => stepLabels[kind];

  const stepBody = (step: Step, location: StepLocation): ReactNode =>
    fieldStepBody(t, step, location, h.updateStep) ??
    flowStepBody(t, step, location, h.updateStep, h.csv) ?? (
      <span className="min-w-0 flex-1 truncate font-mono text-text-primary">
        {describeStep(step)}
      </span>
    );

  const renderStepChildren = (step: Step, location: StepLocation): ReactNode => {
    if (step.kind === 'if') {
      const thenPath: StepContainerPath = [
        ...location.containerPath,
        { index: location.index, slot: 'then' },
      ];
      const elsePath: StepContainerPath = [
        ...location.containerPath,
        { index: location.index, slot: 'else' },
      ];
      return (
        <div className="mt-2 space-y-2 border-l border-border pl-3">
          <StepList
            steps={step.then}
            containerPath={thenPath}
            label={t.thenBranch}
            depth={depth + 1}
            h={h}
          />
          <StepList
            steps={step.else ?? []}
            containerPath={elsePath}
            label={t.elseBranch}
            depth={depth + 1}
            h={h}
          />
        </div>
      );
    }
    if (step.kind === 'repeat' || step.kind === 'forEachRow') {
      const bodyPath: StepContainerPath = [
        ...location.containerPath,
        { index: location.index, slot: 'body' },
      ];
      return (
        <div className="mt-2 border-l border-border pl-3">
          <StepList
            steps={step.body}
            containerPath={bodyPath}
            label={t.bodyBranch}
            depth={depth + 1}
            h={h}
          />
        </div>
      );
    }
    return null;
  };

  const isTopLevel = containerPath.length === 0;
  return (
    <div className={cn(!isTopLevel && 'rounded-md bg-surface-base/40 p-2')}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {label} ({steps.length})
        </h3>
        <span className="flex items-center gap-1">
          <select
            value={h.addKind}
            aria-label={t.addStep}
            onChange={(e) => h.setAddKind(e.target.value as AddableKind)}
            className={cn(FIELD, 'h-7')}
          >
            {ADDABLE_KINDS.map((k) => (
              <option key={k} value={k}>
                {stepTypeLabel(k)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => h.addStep(containerPath, h.addKind)}
          >
            {'+'} {t.addStep}
          </button>
        </span>
      </div>
      <ol className="space-y-1">
        {steps.map((s, i) => {
          const location: StepLocation = { containerPath, index: i };
          return (
            <li
              key={stepLocationKey(location)}
              className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-text-disabled">{i + 1}</span>
                {stepBody(s, location)}
                {ERROR_POLICY_KINDS.has(s.kind) && (
                  <span className="flex shrink-0 items-center gap-1">
                    <select
                      value={('onError' in s ? s.onError : undefined) ?? 'stop'}
                      aria-label={t.onError}
                      title={t.onError}
                      onChange={(e) =>
                        h.setErrorPolicy(location, { onError: e.target.value as StepErrorPolicy })
                      }
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
                        onChange={(e) =>
                          h.setErrorPolicy(location, {
                            retries: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className={cn(FIELD, 'w-12')}
                      />
                    )}
                  </span>
                )}
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label={t.moveUp}
                    disabled={i === 0}
                    onClick={() => h.moveStep(location, -1)}
                  >
                    {'↑'}
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label={t.moveDown}
                    disabled={i === steps.length - 1}
                    onClick={() => h.moveStep(location, 1)}
                  >
                    {'↓'}
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label={t.insertWait}
                    onClick={() => h.insertAfter(location, { kind: 'waitMs', ms: DEFAULT_WAIT_MS })}
                  >
                    {'+⏱'}
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label={t.delete}
                    onClick={() => h.deleteStep(location)}
                  >
                    {'✕'}
                  </button>
                </span>
              </div>
              {renderStepChildren(s, location)}
            </li>
          );
        })}
      </ol>
      {steps.length === 0 && (
        <p className="text-sm text-text-secondary">{isTopLevel ? t.emptyDraft : t.emptyBranch}</p>
      )}
    </div>
  );
}
