import { z } from 'zod';

/**
 * The Recipe IR (Phase 6, RecipeCompiler) — the single schema a distilled task, a recorded human
 * demonstration, and the deterministic re-run executor all share. This is the trust boundary the phase
 * names explicitly: a recipe is untrusted the moment it crosses a process, a file, or a signature check,
 * exactly like any other artifact this repo loads from disk.
 *
 * The property the shape itself is built to enforce: **a value can be a variable reference instead of a
 * literal, structurally.** `RecipeValueSchema` is a union of plain literals and `{ variable: name }`
 * references — the distiller decides, per captured value, which one to emit, and this schema is what
 * makes that decision reversible: `undeclaredVariableRefs` / `unusedVariables` below check the two
 * halves of the contract stay in sync (every reference names a declared variable; every declared
 * variable is actually referenced somewhere). What this schema does NOT do is prove the distiller made
 * the right call on any one value — whether a page-derived string *should* have been a variable is a
 * taint-tracking judgment made before a value ever reaches this IR, not something a shape check can see
 * after the fact.
 */

export const RecipeValueSchema: z.ZodType<RecipeValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.object({ variable: z.string().min(1).max(80) }),
    z.array(RecipeValueSchema).max(200),
  ]),
);
export type RecipeValue =
  | string
  | number
  | boolean
  | null
  | { variable: string }
  | RecipeValue[];

export function isVariableRef(v: RecipeValue): v is { variable: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'variable' in v;
}

/** A durable element reference, matching the S2 identity-ref discipline elsewhere in this repo: a
 *  structural description (role/name/tag), never a positional index that a live page can invalidate. */
export const RecipeSelectorSchema = z.object({
  role: z.string().max(60).optional(),
  name: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
});
export type RecipeSelector = z.infer<typeof RecipeSelectorSchema>;

/** A deterministic post-condition, evaluated with NO model call. `kind` is a closed set — the point of a
 *  recipe assertion is that its evaluator can be exhaustive over the shapes it accepts. */
export const RecipeAssertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url_pattern'), pattern: z.string().min(1).max(2048) }),
  z.object({ kind: z.literal('text_present'), text: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('effect_journaled'), eventType: z.string().min(1).max(80) }),
  z.object({
    kind: z.literal('numeric_extracted'),
    selector: RecipeSelectorSchema,
    comparator: z.enum(['eq', 'gt', 'lt', 'gte', 'lte']),
    value: z.number(),
  }),
]);
export type RecipeAssertion = z.infer<typeof RecipeAssertionSchema>;

/** Hard assertions gate a side-effecting step: failure halts the run before the next step, never a soft
 *  warning. Soft assertions (cosmetic) are recorded but do not by themselves stop the run. */
export const AssertionTierSchema = z.enum(['hard', 'soft']);
export type AssertionTier = z.infer<typeof AssertionTierSchema>;

export const RecipeStepSchema = z.object({
  id: z.string().min(1).max(80),
  tool: z.string().min(1).max(100),
  args: z.record(z.string(), RecipeValueSchema),
  /** Present only for tools the phase's own convention requires it on (create/upload-style). Carried
   *  through so a re-run stays exactly-once, never a compiler decision made up per step. */
  idempotencyKey: z.string().max(200).optional(),
  selector: RecipeSelectorSchema.optional(),
  assertion: RecipeAssertionSchema.optional(),
  assertionTier: AssertionTierSchema.optional(),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

/** Where a variable's value comes from, and whether it is safe to show in a UI / journal entry as-is.
 *  `sensitive` covers both taint (page-derived) and secrecy (author-typed but private) — either one
 *  means "never inline, never log verbatim". */
export const RecipeVariableSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  sensitive: z.boolean(),
});
export type RecipeVariable = z.infer<typeof RecipeVariableSchema>;

export const RecipeProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('distilled'), correlationId: z.string().min(1) }),
  z.object({ kind: z.literal('recorded'), recordedAt: z.number().int().nonnegative() }),
]);
export type RecipeProvenance = z.infer<typeof RecipeProvenanceSchema>;

export const RecipeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  provenance: RecipeProvenanceSchema,
  steps: z.array(RecipeStepSchema).min(1).max(500),
  variables: z.array(RecipeVariableSchema).max(200),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/** Every `{variable: name}` reference in a recipe's steps (args, recursively through arrays, and the
 *  selector's own fields are NOT variable-capable by design — a selector is structural, not a captured
 *  value). Order is step order then first-seen; duplicates collapse. */
export function variableRefsIn(recipe: Recipe): string[] {
  const seen = new Set<string>();
  const collect = (v: RecipeValue): void => {
    if (isVariableRef(v)) {
      seen.add(v.variable);
    } else if (Array.isArray(v)) {
      for (const item of v) collect(item);
    }
  };
  for (const step of recipe.steps) {
    for (const value of Object.values(step.args)) collect(value);
  }
  return [...seen];
}

/** References with no matching `variables` entry — a recipe that would fail at run time with "unbound
 *  variable" the moment it reached that step, caught here before it ever runs. */
export function undeclaredVariableRefs(recipe: Recipe): string[] {
  const declared = new Set(recipe.variables.map((v) => v.name));
  return variableRefsIn(recipe).filter((name) => !declared.has(name));
}

/** Declared variables no step actually references — dead declarations. Not a safety problem on their
 *  own, but a sign the recipe drifted from what it claims to need (e.g. after an edit removed the one
 *  step that used them), which is exactly the kind of drift the phase's Loop Detector / health signal is
 *  meant to catch downstream — this is the free, zero-cost version of that check. */
export function unusedVariables(recipe: Recipe): string[] {
  const used = new Set(variableRefsIn(recipe));
  return recipe.variables.map((v) => v.name).filter((name) => !used.has(name));
}
