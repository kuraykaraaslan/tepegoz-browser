import { z } from 'zod';
import { CompareOpEnum, SelectorKindEnum } from './enums';
import {
  MACRO_IR_VERSION,
  type Macro,
  type Predicate,
  type Selector,
  type Step,
  type VarDecl,
} from './macro-ir';

/**
 * Zod validators for the Macro IR (`macro-ir.ts`) — the trust boundary for every macro crossing IPC,
 * loading from the DB, or starting a run. Bounded (string lengths + array sizes) to fail closed
 * against injection/DoS. Recursive parts (`Predicate`, `Step`) use `z.lazy`; each is typed as the
 * matching IR type so the schema and the hand-written types cannot drift.
 */

const Bounded = z.string().min(1).max(2048);
const VarName = z.string().min(1).max(64);
/** Guard against pathological nesting / huge macros. */
const MAX_CHILDREN = 200;
const MAX_CHAIN = 16;
const MAX_BOOL = 32;

const SelectorSchema: z.ZodType<Selector> = z.object({
  kind: SelectorKindEnum,
  value: Bounded,
  wildcard: z.boolean().optional(),
  regex: z.boolean().optional(),
  attr: z.string().min(1).max(128).optional(),
});

const SelectorChainSchema = z.array(SelectorSchema).min(1).max(MAX_CHAIN);

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('elementExists'), target: SelectorChainSchema }),
    z.object({ kind: z.literal('elementVisible'), target: SelectorChainSchema }),
    z.object({ kind: z.literal('textPresent'), text: Bounded }),
    z.object({ kind: z.literal('textAbsent'), text: Bounded }),
    z.object({ kind: z.literal('varCompare'), left: Bounded, op: CompareOpEnum, right: Bounded }),
    z.object({ kind: z.literal('and'), all: z.array(PredicateSchema).max(MAX_BOOL) }),
    z.object({ kind: z.literal('or'), any: z.array(PredicateSchema).max(MAX_BOOL) }),
    z.object({ kind: z.literal('not'), of: PredicateSchema }),
  ]),
);

export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('navigate'), url: Bounded }),
      z.object({ kind: z.literal('click'), target: SelectorChainSchema }),
      z.object({
        kind: z.literal('fill'),
        target: SelectorChainSchema,
        value: z.string().max(10_000),
      }),
      z.object({ kind: z.literal('press'), key: z.string().min(1).max(40) }),
      z.object({
        kind: z.literal('scroll'),
        direction: z.enum(['up', 'down']),
        amount: z.number().int().positive().max(100_000).optional(),
      }),
      z.object({
        kind: z.literal('extract'),
        target: SelectorChainSchema,
        into: VarName,
        attr: z.string().min(1).max(128).optional(),
        append: z.boolean().optional(),
      }),
      z.object({
        kind: z.literal('waitFor'),
        target: SelectorChainSchema,
        timeoutMs: z.number().int().positive().max(600_000).optional(),
      }),
      z.object({
        kind: z.literal('waitLoad'),
        timeoutMs: z.number().int().positive().max(600_000).optional(),
      }),
      z.object({ kind: z.literal('waitMs'), ms: z.number().int().positive().max(600_000) }),
      z.object({
        kind: z.literal('assert'),
        predicate: PredicateSchema,
        severity: z.enum(['hard', 'soft']),
        message: z.string().max(500).optional(),
      }),
      z.object({ kind: z.literal('setVar'), name: VarName, expr: z.string().max(4096) }),
      z.object({
        kind: z.literal('if'),
        cond: PredicateSchema,
        then: z.array(StepSchema).max(MAX_CHILDREN),
        else: z.array(StepSchema).max(MAX_CHILDREN).optional(),
      }),
      z.object({
        kind: z.literal('repeat'),
        body: z.array(StepSchema).max(MAX_CHILDREN),
        count: z.number().int().positive().max(1_000_000).optional(),
        while: PredicateSchema.optional(),
      }),
      z.object({
        kind: z.literal('forEachRow'),
        csvBlobHash: z.string().min(1).max(128),
        as: VarName,
        onEnd: z.enum(['stop', 'restart']),
        body: z.array(StepSchema).max(MAX_CHILDREN),
        maxRows: z.number().int().positive().max(1_000_000).optional(),
      }),
    ])
    // `repeat` needs exactly one of `count` | `while` — enforced here (discriminatedUnion options
    // must be plain objects, so this cross-field rule lives on the union, not inside an option).
    .superRefine((step, ctx) => {
      if (step.kind === 'repeat' && (step.count === undefined) === (step.while === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'repeat requires exactly one of `count` or `while`',
          path: ['count'],
        });
      }
    }),
);

const VarDeclSchema: z.ZodType<VarDecl> = z.object({
  name: VarName,
  initial: z.string().max(4096).optional(),
});

export const MacroSchema: z.ZodType<Macro> = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  version: z.number().int().positive().max(MACRO_IR_VERSION),
  variables: z.array(VarDeclSchema).max(256),
  steps: z.array(StepSchema).max(MAX_CHILDREN),
});

/** Safe-parse an untrusted macro (IPC/DB/run boundary). Returns the zod result. */
export function parseMacro(input: unknown): z.SafeParseReturnType<unknown, Macro> {
  return MacroSchema.safeParse(input);
}
