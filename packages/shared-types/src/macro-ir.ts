/**
 * Macro IR — the canonical, deterministic, no-code automation format for `ext-macros` (our own
 * format; NOT iMacros `.iim`). Deliberately **zod-free** and its own module so the desktop IPC
 * contract (imported by the SANDBOXED preload) can consume the types at runtime; the matching zod
 * validators are built from these same const arrays in `macro-schema.ts`.
 *
 * Design answers the iMacros post-mortem (`docs/iMacros Şikayet ve Öneri Analizi.md`): robust
 * multi-candidate selectors with auto-wait (vs static `TAG POS`), real control flow (`if`/`repeat`
 * vs no `if/else`/no nested loops), unlimited variables/arrays (vs the 3-var cap), and data-driven
 * CSV loops with explicit restart (vs the infinite-loop hacks).
 */

/** Bump when the IR shape changes in a non-backward-compatible way (stored on every `Macro`). */
export const MACRO_IR_VERSION = 1;

// ── Selectors ────────────────────────────────────────────────────────────────────────────────────

/** A selector candidate kind. Replay tries a chain of these in order, first match wins (auto-wait). */
export const SELECTOR_KINDS = ['css', 'xpath', 'text', 'attr'] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

export interface Selector {
  kind: SelectorKind;
  /** The selector value: a CSS query, an XPath, visible text, or (with `attr`) an attribute value. */
  value: string;
  /** `value` uses `*` wildcards (e.g. a URL/text fragment) — glob-matched. */
  wildcard?: boolean | undefined;
  /** `value` is a regular expression (text/attr) — regex-matched. */
  regex?: boolean | undefined;
  /** For `kind: 'attr'`: the attribute name to match (`value` is the attribute-value pattern). */
  attr?: string | undefined;
}

/** An ordered fallback chain of selector candidates; the first that resolves (within auto-wait) wins. */
export type SelectorChain = Selector[];

// ── Predicates (conditions for if / repeat-while / assert) ─────────────────────────────────────────

export const COMPARE_OPS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains', 'matches'] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

export const PREDICATE_KINDS = [
  'elementExists',
  'elementVisible',
  'textPresent',
  'textAbsent',
  'varCompare',
  'and',
  'or',
  'not',
] as const;
export type PredicateKind = (typeof PREDICATE_KINDS)[number];

/** A deterministic, model-free condition evaluated during a run. Recursive (and/or/not). */
export type Predicate =
  | { kind: 'elementExists'; target: SelectorChain }
  | { kind: 'elementVisible'; target: SelectorChain }
  /** `text` may interpolate `{{var}}`; matched against the page's visible text. */
  | { kind: 'textPresent'; text: string }
  | { kind: 'textAbsent'; text: string }
  /** Compare two safe expressions over the variable store (see `setVar.expr`). */
  | { kind: 'varCompare'; left: string; op: CompareOp; right: string }
  | { kind: 'and'; all: Predicate[] }
  | { kind: 'or'; any: Predicate[] }
  | { kind: 'not'; of: Predicate };

// ── Steps ────────────────────────────────────────────────────────────────────────────────────────

export const STEP_KINDS = [
  'navigate',
  'click',
  'fill',
  'press',
  'scroll',
  'extract',
  'waitFor',
  'waitLoad',
  'waitMs',
  'assert',
  'setVar',
  'if',
  'repeat',
  'forEachRow',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** `assert` failure severity: `hard` aborts the run; `soft` journals and continues. */
export type AssertSeverity = 'hard' | 'soft';

/** One macro instruction. A discriminated union on `kind`; `if`/`repeat`/`forEachRow` nest `Step[]`. */
export type Step =
  /** `url` interpolates `{{var}}`. */
  | { kind: 'navigate'; url: string }
  | { kind: 'click'; target: SelectorChain }
  /** `value` interpolates `{{var}}` / CSV columns. */
  | { kind: 'fill'; target: SelectorChain; value: string }
  | { kind: 'press'; key: string }
  | { kind: 'scroll'; direction: 'up' | 'down'; amount?: number | undefined }
  /** Read text (or `attr`) from the target into variable `into`; `append` pushes onto an array var. */
  | {
      kind: 'extract';
      target: SelectorChain;
      into: string;
      attr?: string | undefined;
      append?: boolean | undefined;
    }
  | { kind: 'waitFor'; target: SelectorChain; timeoutMs?: number | undefined }
  /** Wait for the current page's navigation/load to settle (e.g. after a click that triggers nav). */
  | { kind: 'waitLoad'; timeoutMs?: number | undefined }
  | { kind: 'waitMs'; ms: number }
  | { kind: 'assert'; predicate: Predicate; severity: AssertSeverity; message?: string | undefined }
  | { kind: 'setVar'; name: string; expr: string }
  | { kind: 'if'; cond: Predicate; then: Step[]; else?: Step[] | undefined }
  /** Loop `body` a fixed `count` OR `while` a predicate holds (exactly one of the two). Nestable. */
  | { kind: 'repeat'; body: Step[]; count?: number | undefined; while?: Predicate | undefined }
  /** Iterate CSV rows (a content-addressed blob) binding each row to var `as`; `onEnd` picks stop
   *  vs restart-from-row-1 (answers the iMacros CSV infinite-loop hacks). */
  | {
      kind: 'forEachRow';
      csvBlobHash: string;
      as: string;
      onEnd: 'stop' | 'restart';
      body: Step[];
      maxRows?: number | undefined;
    };

// ── Macro ────────────────────────────────────────────────────────────────────────────────────────

/** A declared variable + its optional initial safe-expression value. */
export interface VarDecl {
  name: string;
  initial?: string | undefined;
}

/** A complete, saved macro. `version` is {@link MACRO_IR_VERSION} at author time. */
export interface Macro {
  id: string;
  name: string;
  version: number;
  variables: VarDecl[];
  steps: Step[];
}

// ── Wire DTOs (shared by the IPC contract, the extension surfaces, and the agent capabilities) ──────

/** A saved macro's metadata (list view — the full IR is fetched per-item). */
export interface MacroSummary {
  id: string;
  name: string;
  stepCount: number;
  updatedAt: number;
}

/** Run a saved macro, optionally binding initial variables. */
export interface MacroRunInput {
  macroId: string;
  variables?: Record<string, string> | undefined;
}

/** Run an UNSAVED macro IR directly (record/edit → play without persisting). */
export interface MacroRunDraftInput {
  macro: Macro;
  variables?: Record<string, string> | undefined;
}

/** Streaming run progress. `failingStep`/`detail` name the exact failure (anti-"opaque error code"). */
export type MacroRunProgress =
  | { runId: string; phase: 'started'; total: number }
  | { runId: string; phase: 'step'; index: number; kind: string }
  | { runId: string; phase: 'done' }
  | { runId: string; phase: 'failed'; failingStep?: number | undefined; detail: string };

/** A step captured during recording (streamed to the author UI). */
export interface MacroRecordedStep {
  index: number;
  step: Step;
}
