# ADR-0030: NotaryService — hash-chained Journal, signed checkpoints, a receipt nobody has to trust the vendor to read

- **Status:** Accepted
- **Date:** 2026-08-19
- **Refines:** [ADR-0004](0004-event-sourced-journal.md) (event-sourced Journal — "shown = recorded")
- **Phase:** [Phase 7 — Verifiable Accountability & Proof-of-Run](../../phases/product/phase-7-verifiable-accountability.md), L1/L7/L8 (NotaryService foundation)

## Numbering note

The phase document names this **ADR-0014**. That number was already claimed and accepted by
[0014-user-data-layout-db-connector.md](0014-user-data-layout-db-connector.md) before this phase's own
ADR was written — the phase doc predates that collision. This lands as **ADR-0030**, continuing the
sequence from [0029](0029-devtools-expose-boundary.md); the phase doc's task line should be read as
referring to this file.

## Context

The Journal already records "what the agent did" as an append-only, event-sourced fact
(ADR-0004: _shown = recorded_). What it does not yet provide is a way for someone who is **not** running
tepegöz — an auditor, an insurer, a regulator, an opposing party in a dispute — to check that a specific
record is genuine, without trusting the vendor who produced it to also grade its own homework. That
capability is the precondition Phase 7 names for regulated FinServ/health/legal adoption, and it is the
part competitors relying on server-side logs are structurally unable to offer, because their proof lives
on infrastructure the customer cannot independently inspect.

Two failure modes have to be ruled out, and they are different failures:

1. **Silent tampering** — a record edited after the fact, with nobody able to tell.
2. **A self-consistent forgery** — a document that is internally coherent (a fabricated chain, signed by
   whoever built it) but was never actually produced by this device on this run.

A hash chain alone defeats (1) but not (2): anyone with write access to the database can always
regenerate a consistent chain from scratch. Only an external anchor — a signature over a key the verifier
did not have to trust the document itself to learn — closes (2).

## Decision

**A per-event hash chain, folded into an Ed25519-signed checkpoint, packaged as a self-contained Replay
Receipt a standalone CLI can verify with nothing installed but Node.**

Landed in `@tepegoz/notary` (a new, dependency-light package — `zod` only):

- **`selfHashOf` / `chainEvents` / `verifyChain`** (`hash-chain.ts`) fold each event's identifying fields
  plus the _previous_ event's hash into 64 hex characters, over a canonical (key-sorted) JSON encoding.
  Editing an event changes its own hash, which changes what the next event was chained against, so the
  break is detectable however far downstream it is checked. `verifyChain` reports **which** invariant
  broke — a `hash_mismatch` (this event's own fields were altered) reads differently from a `broken_link`
  (an event was reordered, inserted, or removed) — because the two point an investigator at different
  causes.
- **Canonical JSON** (`canonical-json.ts`) exists as its own module because `JSON.stringify`'s key order
  follows construction order: without a canonical form, rebuilding an identical event from its own fields
  could hash differently from the original and flag an intact record as tampered.
- **Ed25519 checkpoints** (`checkpoint.ts`), built on `node:crypto` rather than a dependency — a
  single-pass signature with no hash-algorithm choice to get wrong, and available with nothing beyond
  Node itself, which is what the standalone verifier needs. A checkpoint signs the chain root **and the
  timestamp together**, so a stale root cannot be replayed as freshly checkpointed.
- **The Replay Receipt** (`replay-receipt.ts`) is the portable unit: one run's `correlationId` slice,
  chained, plus its checkpoint — self-contained, so `verifyReceipt` needs nothing else. It returns one of
  three verdicts, and the distinction is the point: `PASS`, `TAMPERED` (the document contradicts itself —
  the case the feature exists to catch), or `INVALID` (wrong shape entirely — a usage error, like the
  wrong file, never itself evidence of tampering). A checkpoint that verifies over the _wrong_ root is
  `TAMPERED`, not a caveated pass — a receipt is a binary claim.
- **`tepegoz-verify`** (`cli.ts`, bundled by `scripts/build-cli.mjs`) is a plain Node script — `zod`
  parses the untrusted file at the boundary, `verifyReceipt` judges it, exit codes double as the
  machine-readable result (0 PASS / 1 TAMPERED / 2 INVALID / 3 usage error).

**Key custody is deliberately out of this module.** Signing needs a private key; where it is generated,
persisted (`safeStorage` in the main process), and rotated is a main-process concern the notary package
does not decide, so the pure logic stays testable without Electron and reusable by the CLI unmodified.

## Consequences

**Positive.** The chain-then-sign design means the algorithmic core — the part most likely to hide a
subtle bug — is fully unit-tested (49 tests) with no database, no Electron, and no key-management
plumbing in the way. The receipt format is genuinely portable: it was verified in this session by running
the **built package output** (not the source) as a plain `node dist/tepegoz-verify.mjs receipt.json`,
against both a genuine and a hand-tampered receipt.

**A real bundling problem was found and fixed while proving this.** The monorepo's shared
`moduleResolution: "bundler"` setting is correct for how every other package here is consumed — as
TypeScript source resolved by Vite/Vitest — but a plain `tsc` build under that setting emits extension-
less relative imports that Node's own ESM loader refuses to resolve. A `tsc`-only build of the CLI would
have failed on a real machine before reading a single receipt. `scripts/build-cli.mjs` bundles with
esbuild (already a transitive workspace dependency, pinned explicitly here) instead, so the _shipped_
artifact has no relative imports left to resolve — the standalone claim was checked by actually running
the standalone artifact, not assumed from the source compiling.

**Negative / accepted.** Chaining hashes over the Journal's already-redacted payload proves the
_redacted_ record is intact — it says nothing about whether the pre-redaction content matched, which the
phase doc names as an open risk. Sealing a pre-redaction digest is not built.

**Owed, and stated rather than implied.** Nothing in `apps/desktop` calls this package yet: no migration
adds chain columns to the `events` table, `EventJournal.append` does not compute a `selfHash`, and no key
is generated or stored via `safeStorage`. The algorithmic core is proven; the wiring that would let a
real run produce a real receipt is not. OpenTimestamps/RFC3161 anchoring is not built. The Accountability
Dashboard, Counterfactual Dry-Run, Cost & Risk Contract, and Data Rights export — the other four DoD
items in this phase — are untouched.
