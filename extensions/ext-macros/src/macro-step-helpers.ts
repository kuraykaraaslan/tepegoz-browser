import { MACRO_IR_VERSION, type Macro, type Step } from '@tepegoz/shared-types';

export const BTN =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary hover:opacity-90 ' +
  'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay ' +
  'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const ICON_BTN =
  'rounded border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-overlay ' +
  'hover:text-text-primary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const FIELD =
  'h-7 rounded border border-border bg-surface-base px-1.5 text-xs text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export const DEFAULT_WAIT_MS = 500;
export const DEFAULT_ELEMENT_TIMEOUT_MS = 10_000;
export const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
export const uuid = (): string => crypto.randomUUID();

/** Named keys the `press` step supports (mirrors the engine/CDP KEY_MAP). */
export const PRESS_KEYS = [
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Space',
] as const;

/** The step kinds the editor can add from scratch (recorded macros may contain any kind). */
export const ADDABLE_KINDS = [
  'navigate', 'click', 'fill', 'press', 'scroll', 'extract', 'setVar', 'waitFor', 'waitLoad', 'waitMs',
] as const;
export type AddableKind = (typeof ADDABLE_KINDS)[number];

/** A single-CSS-candidate selector chain (the editor authors CSS; recordings keep richer chains). */
export const cssChain = (value: string) => [{ kind: 'css' as const, value }];

/** Step kinds that carry a per-step error policy (browser actions). */
export const ERROR_POLICY_KINDS = new Set<Step['kind']>([
  'navigate', 'click', 'fill', 'press', 'scroll', 'extract', 'waitFor', 'waitLoad',
]);

export function newStepOfKind(kind: AddableKind): Step {
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
export function describeStep(step: Step): string {
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

export function emptyDraft(): Macro {
  return { id: uuid(), name: '', version: MACRO_IR_VERSION, variables: [], steps: [] };
}
