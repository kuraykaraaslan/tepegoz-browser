# @tepegoz/recipe-compiler

Phase 6 — the deterministic gates a **recipe** (a distilled, replayable automation) is run through.
No model calls: every function here is a plain comparison, because each one guards a side-effecting
step and a gate that can be "mostly right" is not a gate. Pure, `@tepegoz/shared-types` for the
schema, unit-tested.

## Exports

- **`evaluateAssertion(assertion, snapshot)`** — the success oracle for "self-correcting golden
  assertions". A recipe carries the post-condition its *original* successful run actually satisfied
  (captured at distill time, not authored as a wish); this checks it against a `RunSnapshot` — URL,
  page-text, journaled effect types, extracted numerics — and returns `{ passed }` with a reason on
  failure. It exists to catch **penultimate-step abandonment**: an agent that stops one step early
  and reports success anyway.
- **`shouldHaltOnFailure(...)`** — the gate that decides whether a failed assertion halts the run or
  is advisory.
- **`narrowToUnattended` / `mayRunUnattended`** — the sealed one-way narrowing for the
  AutomationScheduler (phase ADR-0013). A scheduled run gets **only** read + author-time
  pre-approved idempotent state-changes, and **never** wider than what the recipe's own interactive
  authoring run approved — the schedule can't grow the recipe's authority after the fact.
  `destructive` and `financial` steps never auto-run, no flag overrides it; per the phase DoD they
  pause for a human (that pause/resume needs a live scheduler and lives elsewhere — this module only
  answers the yes/no).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
