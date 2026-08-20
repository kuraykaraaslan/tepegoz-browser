# ADR-0031: RecipeCompiler & deterministic-replay trust model — a recipe carries no escalated trust

- **Status:** Accepted (IR shape + assertion evaluator only — see Consequences)
- **Date:** 2026-08-20
- **Complements:** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic policy kernel)
- **Phase:** [Phase 6 — Deterministic Replayable Automation](../../phases/product/phase-6-deterministic-automation.md), L1/L4/L5 (RecipeCompiler) and the "self-correcting golden assertions" success oracle

## Numbering note

The phase document names this **ADR-0012**. That number was already claimed by
[0012-browser-tab-model.md](0012-browser-tab-model.md). This lands as **ADR-0031**, continuing from
[0030](0030-notary-service.md); the phase doc's task line should be read as referring to this file.

## Context

The phase's promise — "demonstrate once, run forever, nearly free" — only holds if replaying a recipe is
exactly as safe as the run it came from, forever, on every future run, including runs an attacker had a
chance to influence between recordings. A recipe that carried its own elevated trust ("this recipe was
signed once, so its steps skip the usual checks") would turn every successfully distilled task into a
standing exploit: poison one recipe, and every future replay inherits the poison with no re-check.

Two shapes of that failure the design has to rule out specifically: a captured secret quietly baked into
a step's arguments as an ordinary-looking literal, and a run that stopped one step short of actually
finishing while still reporting success — the "penultimate-step abandonment" the phase names as a
concrete, already-observed competitor failure mode.

## Decision

**A recipe is data, not authority. Every step re-passes the Policy Kernel at run time, and the recipe
format itself makes a captured value structurally distinct from an authored constant.**

Landed in `@tepegoz/shared-types/recipe-ir.ts` and `@tepegoz/recipe-compiler`:

- **`RecipeValueSchema`** is a union of plain literals and `{ variable: name }` references, never a third
  shape that could smuggle a captured value in as if it were author-chosen. `undeclaredVariableRefs` /
  `unusedVariables` check the two halves of that contract stay in sync — every reference names a real
  declaration, every declaration is actually used — catching a recipe that would fail at run time with
  "unbound variable" before it ever runs, and flagging drift (a declaration nothing uses any more) as a
  free signal of the same kind the phase's Loop Detector / health score are meant to surface downstream.
  What this schema does **not** do is prove any one value was correctly classified — that taint judgment
  happens before a value reaches the IR, at distillation time, which is out of scope here (see
  Consequences).
- **`evaluateAssertion`** is the success oracle: a deterministic check against exactly what a re-run
  actually observed (URL, page text, journaled effect types, extracted numerics) — no model call, so it
  cannot be talked out of a verdict. It is exhaustive over `RecipeAssertion`'s closed union
  (`RecipeAssertionSchema` is a `z.discriminatedUnion`), and an unrecognised kind fails rather than
  passes — a hard gate that silently passed on an unknown shape would be worse than one that never ran.
- **`shouldHaltOnFailure`** defaults an unmarked assertion to `hard`: an author who attached a
  post-condition almost certainly meant it as a real check, and treating it as decorative by default
  would silently downgrade "verified-done, not vibe-done" the moment one field was left unset.

## Consequences

**Positive.** The taint-safe representation and the model-free success oracle are both real and unit-
tested (26 tests) before either the distiller or the re-run executor exists to produce or consume real
recipes — the shape of the trust boundary is settled first, which is what the phase's own
fixture-freeze-style discipline (elsewhere in this repo) argues for.

**Negative / accepted.** `evaluateAssertion` judges a snapshot it is handed; it cannot itself detect that
a distiller mis-classified a page-derived value as a literal instead of a variable. That is a property of
the *distiller*, not of this schema or evaluator, and is out of scope for this ADR.

**Owed, and stated rather than implied.** This ADR covers exactly two of the phase's five task groups.
Untouched: the distiller itself (folding a `TaskSucceeded` event chain into a Recipe), the CDP "Record
Automation" front-end, the deterministic re-run executor, the "My Automations" panel, and the bounded
failure-recovery ladder beyond its first and last rungs (re-stabilize, re-perceive/re-bind, and the one
scoped model replan are not implemented — a hard-tier failure halts immediately today, which is a strict
subset of the intended behaviour, never a wider one). Policy Kernel re-passing at run time is asserted as
a design requirement here; it is enforced by [ADR-0006](0006-policy-kernel-hitl.md)'s existing kernel and
has not been specifically re-verified against a live recipe executor, because none exists yet.
