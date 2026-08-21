import type { ReactNode } from 'react';
import { cn } from '@tepegoz/ui';
import type { Step } from '@tepegoz/shared-types';
import type { MacrosStrings } from './i18n';
import {
  DEFAULT_ELEMENT_TIMEOUT_MS,
  DEFAULT_LOAD_TIMEOUT_MS,
  FIELD,
  PRESS_KEYS,
  cssChain,
} from './macro-step-helpers';
import type { StepLocation } from './macro-step-tree';
import { selectorInput } from './macro-panel-core-predicate';

/** Editors for the "leaf" action steps. Returns `null` for control-flow kinds handled elsewhere. */
export function fieldStepBody(
  t: MacrosStrings,
  step: Step,
  location: StepLocation,
  updateStep: (location: StepLocation, next: Step) => void,
): ReactNode | null {
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
    return selectorInput(t, step.target[0]?.value ?? '', (v) =>
      updateStep(location, { ...step, target: cssChain(v) }),
    );
  }
  if (step.kind === 'fill') {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {selectorInput(t, step.target[0]?.value ?? '', (v) =>
          updateStep(location, { ...step, target: cssChain(v) }),
        )}
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
          onChange={(e) =>
            updateStep(location, { ...step, direction: e.target.value === 'up' ? 'up' : 'down' })
          }
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
        {selectorInput(t, step.target[0]?.value ?? '', (v) =>
          updateStep(location, { ...step, target: cssChain(v) }),
        )}
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
          onChange={(e) =>
            updateStep(location, { kind: 'waitMs', ms: Math.max(1, Number(e.target.value)) })
          }
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
          onChange={(e) =>
            updateStep(location, { ...step, target: [{ kind: 'css', value: e.target.value }] })
          }
          className={cn(FIELD, 'min-w-0 flex-1')}
        />
        <input
          type="number"
          min={1}
          value={step.timeoutMs ?? DEFAULT_ELEMENT_TIMEOUT_MS}
          aria-label={t.durationMs}
          onChange={(e) =>
            updateStep(location, { ...step, timeoutMs: Math.max(1, Number(e.target.value)) })
          }
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
          onChange={(e) =>
            updateStep(location, { ...step, timeoutMs: Math.max(1, Number(e.target.value)) })
          }
          className={cn(FIELD, 'w-24')}
        />
        {'ms'}
      </span>
    );
  }
  return null;
}
