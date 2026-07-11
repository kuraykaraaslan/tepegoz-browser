import { cn } from '@tepegoz/ui';
import { COMPARE_OPS, type CompareOp, type Predicate } from '@tepegoz/shared-types';
import type { MacrosStrings } from './i18n';
import { FIELD, cssChain } from './macro-step-helpers';

export const EDITABLE_PREDICATE_KINDS = [
  'textPresent',
  'textAbsent',
  'elementExists',
  'elementVisible',
  'varCompare',
] as const;
export type EditablePredicateKind = (typeof EDITABLE_PREDICATE_KINDS)[number];

/** A reusable CSS-selector text input (shared by step editors and predicate editors). */
export const selectorInput = (t: MacrosStrings, value: string, onValue: (v: string) => void) => (
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

export function describePredicate(t: MacrosStrings, predicate: Predicate): string {
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
      return `not(${describePredicate(t, predicate.of)})`;
  }
}

export function predicateEditor(t: MacrosStrings, predicate: Predicate, onChange: (next: Predicate) => void) {
  const predicateLabels: Record<EditablePredicateKind | 'advanced', string> = {
    textPresent: t.predTextPresent,
    textAbsent: t.predTextAbsent,
    elementExists: t.predElementExists,
    elementVisible: t.predElementVisible,
    varCompare: t.predVarCompare,
    advanced: t.predAdvanced,
  };
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
        {editableKind === 'advanced' && <option value="advanced">{predicateLabels.advanced}</option>}
        {EDITABLE_PREDICATE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {predicateLabels[kind]}
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
        ? selectorInput(t, predicate.target[0]?.value ?? '', (v) => onChange({ ...predicate, target: cssChain(v) }))
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
        <span className="min-w-0 flex-1 truncate font-mono text-text-secondary">{describePredicate(t, predicate)}</span>
      )}
    </span>
  );
}
