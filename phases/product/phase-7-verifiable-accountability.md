# Phase 7 — Verifiable Accountability & Proof-of-Run

**Status:** 🟡 In progress (NotaryService algorithmic foundation landed 2026-08-19) · **Estimate:** ~3–4 months · **Depends on:** Phase 1a/1b (Event Journal, Token
Ledger, Effect Ledger, shadow workspace, plan-preview)
**Goal:** Turn the event-sourced substrate into **proof**: convert "shown = recorded" into "recorded =
mathematically provable." Six independent strategy lenses converged on the same primitive — hash-chain the
append-only Journal, sign checkpoints with a per-device key, and emit portable, third-party-verifiable proofs
of what the agent did, under which policy, on which provider. This is the **precondition for regulated
FinServ/health/legal adoption** competitors are structurally locked out of, and it is nearly free on the
append-only Journal.
**Branch examples:** `feat/notary-service`, `feat/accountability-dashboard`, `feat/counterfactual-dry-run`,
`feat/cost-risk-contract`, `feat/data-rights`

## Exit criteria (DoD)

- [x] **Replay Receipt** is emitted for a completed task and validated by a **standalone `tepegoz-verify` CLI**
      (no tepegöz install) → PASS; a tampered event → FAIL/TAMPERED
      _(2026-09-15: reachable end-to-end — the existing header-star "export diagnostic bundle" button now
      also writes a signed receipt per turn into `runs/*.receipt.json`; see the task note below for the
      standalone-CLI validation. Not yet true: a DEDICATED one-click "just the receipt" affordance — it
      only comes bundled with the full diagnostic export today.)_
- [ ] **Accountability Dashboard** answers "Why did the agent do X?" with a deterministic causal trace
      reconstructed **without** a model call
- [ ] **Counterfactual Dry-Run** produces a human-readable Consequence Report for a full plan with **zero real
      side-effects**, then commits the identical plan for real on approval
- [~] **Pre-flight Cost & Risk Contract** shown + accepted before run; on failure the auto-refund is a
      verifiable before/after diff against the contract
      _(2026-09-15: the plan-preview modal — already blocking, already accepted before a run — now shows
      each step's declared danger class, which sites the plan will touch (reusing `planGrantScope`'s own
      URL-collection heuristic, so the preview and the grant it leads to can never disagree about scope),
      AND a floor count of `guaranteedApprovals` — steps whose `classifyRisk`-derived tier is one
      `NEVER_AUTO_GRANTABLE_TIERS` names, which per `risk-tier.ts`'s own invariant asks a human "every
      time", under every autonomy level, no exceptions. Shown only when > 0 (a "0" line would misleadingly
      read as "nothing will ask for approval" — this is a floor, not the total, since `ask`/`notify`
      autonomy prompts for more than just these tiers, and that fuller count needs the live Policy Kernel,
      unavailable at plan-preview time). Cost estimation and the refund diff are still open; see the task
      note below.)_
- [~] **Data Rights**: a subject-access export + a **provable erasure** (tombstone + blob-refcount decrement)
      complete end-to-end; erasure is itself an append-only recorded event
      _(2026-09-15: subject-access export is real — see the task note below — but read-only; erasure is
      untouched, deliberately: a wrong deletion is a worse failure than a missing feature, and deserves
      its own pass rather than riding in on a search feature's momentum.)_
- [ ] **i18n:** en+tr keys added for new surfaces (Notary/receipt UI, Accountability Dashboard, Dry-Run report,
      Cost/Risk contract, Data Rights panel, Compliance Pack export)
- [x] ADR accepted: **ADR-0014** (NotaryService: hash-chained Journal + signed Replay Receipts + anchoring)
      _(lands as [ADR-0030](../../docs/adr/0030-notary-service.md) — ADR-0014 was already claimed by an earlier, unrelated, accepted ADR before this phase document was written; see the numbering note at the top of ADR-0030.)_
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB (chain fields
      are **additive**, append-only preserved)

> **What actually runs today (2026-08-19).** The hash-chain math, the Ed25519 checkpoint signing, the
> Replay Receipt format, and the standalone verifier are all real and tested — 49 tests in
> `@tepegoz/notary`, plus an out-of-band check that the BUILT CLI runs as plain Node with no
> `node_modules`. **None of it is wired into a live run.** No migration adds chain columns to the
> `events` table, `EventJournal.append` does not compute a hash, and no signing key exists in
> `safeStorage`. A receipt cannot be produced from a real task yet — only from data handed to
> `buildReceipt` directly, which is how the whole test suite exercises it. The Accountability
> Dashboard, Counterfactual Dry-Run, Cost & Risk Contract, and Data Rights export are untouched.
>
> **Update, 2026-09-15 — the migration/schema half of that gap is closed, and the compute half now runs
> for ONE call site.** `events` HAS `prev_hash`/`self_hash` columns (migration v26, nullable, no
> backfill), `EventRecord`/`EventInput` (`@tepegoz/shared-types`) carry optional `prevHash`/`selfHash`,
> `EventJournal.append` persists them when given, and `EventJournal.tailHash(db)` reads back where a
> chain left off. `apps/desktop/src/main/notary/chained-journal.ts`'s `appendChainedEvent` is the caller
> that actually folds `selfHashOf` (persistence still may not depend on `@tepegoz/notary` — the compute
> stays out of that package by design), and `ipc-agent-run.ts`'s `onEvent`/`onCheckpoint` — every
> `AgentStepExecuted`/`PolicyBlocked`/`HitlRequested`/`HandoffRequested`/`TaskSucceeded`/`TaskFailed`/
> `CheckpointWritten` row a live agent run writes — now go through it. **What still does not chain:**
> every OTHER domain (downloads, uploads, chat, tasks, …) still calls `EventJournal.append` directly,
> unchained — intentionally scoped to the agent-run path first, same as the run-report before it.
>
> **2026-09-15.** The unsigned run-report transform landed: `buildRunReport` + `renderRunReportMarkdown`
> in `@tepegoz/notary` (79 tests now), structuring one run's Journal events (ordered by `lsn`, latency
> between steps, terminal outcome from the last `TaskSucceeded`/`TaskFailed`, optional token usage) into
> the single self-contained Markdown document the task below specifies.
>
> **Same day, wired into a real run.** `agent:export-run-report` is a live IPC channel now:
> `registerAgentRunReportIpc` (`apps/desktop/src/main/ipc/ipc-agent-run-report.ts`) reads the SPECIFIC
> run's events via `EventJournal.readRecent(db, 1000, runId)` — never a global/unscoped read — plus its
> non-refunded token totals via the new `TokenStore.totalsForRun(db, correlationId)`, renders the real
> Markdown, and writes it to `~/tepegoz/` exactly like the existing plain chat-log export. Callable
> end-to-end from `window.api.exportAgentRunReport({ runId, goal })` today.
>
> **Same day, one more layer: the Replay Receipt itself.** `agent:export-run-receipt` re-verifies a run's
> STORED hash chain (catching a row edited directly in the database after it was chained — the actual
> reason `prev_hash`/`self_hash` are persisted at all, not merely recomputed at report time), signs a
> fresh self-contained receipt with the device's Ed25519 key (`NotarySigningKeyStore.getOrCreate()`'s
> first real caller), and writes it to `~/tepegoz/`. **Independently confirmed against the BUILT
> standalone CLI**, not just the library function or a mock: a realistic 3-event receipt PASSed (`node
> dist/tepegoz-verify.mjs` → exit 0), and a hand-tampered copy came back TAMPERED at the exact edited
> event (exit 1) — the DoD's own acceptance language, demonstrated literally.
>
> **Same day, the "no UI affordance" gap on BOTH of the above closed** — not with a new button, with the
> EXISTING one. `collectAgentExportBundleFiles` (the header-star "export diagnostic bundle" the panel
> already ships) now accepts the session's `(runId, prompt)` pairs from the renderer's own Turn state
> (main cannot derive "which runIds belong to this group" from the journal alone) and writes
> `runs/<runId>.report.md` + `runs/<runId>.receipt.json` for every turn that ran, best-effort per run so
> one failure never takes the rest of the bundle down. The signing key is fetched ONCE per export, not
> once per turn. A real user can now get a real signed receipt with the same click they already use for
> diagnostics — no dedicated "export receipt" icon exists, but the capability is genuinely reachable, not
> devtools-only. `panel-actions.ts`'s `onExportLog` supplies the turns; 5 new tests in
> `export-bundle.electron.test.ts` cover the happy path, the signing-key-unavailable path, the
> refused-receipt path, and the per-run failure isolation.

## Tasks

### L1/L7/L8 — NotaryService (the foundation)

- [~] Per-event **hash chain**: `prevHash` + `selfHash` over the canonical (payload/`blobRef`/ts/actor); folded
  periodically into **Ed25519-signed checkpoints** (signing key in `safeStorage`)
  _(landed: [hash-chain.ts](../../packages/notary/src/hash-chain.ts) + [checkpoint.ts](../../packages/notary/src/checkpoint.ts).
  **2026-09-15, key custody landed too:**
  [notary-signing-key.electron.ts](../../apps/desktop/src/main/notary/notary-signing-key.electron.ts) —
  `NotarySigningKeyStore.getOrCreate()` generates the device's Ed25519 key on first use and persists it
  through `safeStorage` (mirrors `vpn-secrets.electron.ts`/`chat-secrets.electron.ts`), refusing rather
  than falling back to plaintext when the keychain is unavailable. Deliberately conservative on the one
  case that matters most for a signing key: a stored-but-undecryptable or malformed key THROWS instead of
  silently minting a replacement, because a silent replacement would orphan every checkpoint already
  signed under the old key with no record of why verification later fails. Nothing calls
  `getOrCreate()` yet.
  **Also landed, same day:** migration v26 (`prev_hash`/`self_hash` on `events`, nullable, no backfill —
  a pre-existing row was never actually chained, so it stays NULL forever rather than pretending
  otherwise) + the matching optional `prevHash`/`selfHash` fields on `EventRecord`/`EventInput`
  (`@tepegoz/shared-types`) + `EventJournal.append` persisting them when given +
  `EventJournal.tailHash(db)` to read back where a chain left off.
  **Third commit, same day — the actual fold now runs for one call site:**
  [chained-journal.ts](../../apps/desktop/src/main/notary/chained-journal.ts)'s `appendChainedEvent`
  reads `tailHash`, computes `selfHash` via `@tepegoz/notary`'s `selfHashOf` (persistence still may not
  import that package — the fold has to live here), and calls `EventJournal.append` with both fields
  filled in. `ipc-agent-run.ts`'s `onEvent`/`onCheckpoint` — every agent-run journal write — now goes
  through it instead of `EventJournal.append` directly. **Still owed:** every OTHER append call site
  (downloads/uploads/chat/tasks/…) still writes unchained — scoped to agent runs first, deliberately, same
  as the run-report; `NotarySigningKeyStore.getOrCreate()` still has no caller, so no checkpoint is ever
  signed; and nothing folds a periodic `Checkpoint` at all yet — today the chain grows unboundedly with no
  anchor, which is the next piece.)_
- [~] Portable, self-contained **Replay Receipt**: signed event subtree + authorizing **policy-IR snapshot** +
  model/provider/cost (from Token Ledger) + `cas://` blob hashes
  _(landed: [replay-receipt.ts](../../packages/notary/src/replay-receipt.ts) — the event subtree + checkpoint.
  **2026-09-15, wired into a real run:**
  [build-run-receipt.ts](../../apps/desktop/src/main/notary/build-run-receipt.ts) +
  [ipc-agent-run-receipt.ts](../../apps/desktop/src/main/ipc/ipc-agent-run-receipt.ts) register
  `agent:export-run-receipt` — the first real caller of `NotarySigningKeyStore.getOrCreate()`. It
  re-verifies the run's STORED hash chain (catches a row edited directly in the database after
  `appendChainedEvent` wrote it — a fresh re-hash alone would launder that), then builds a fresh,
  self-contained receipt re-chained from `GENESIS_HASH` (never the device's real tail — a standalone
  verifier has nothing to check an arbitrary claimed tail against) and signs it with the device key.
  **Manually validated against the BUILT standalone CLI**, not just the library function: generated a
  receipt from a realistic 3-event run, `node dist/tepegoz-verify.mjs` → `PASS — run-demo-1 verified (3
  events)` (exit 0); hand-tampered one event's payload → `TAMPERED — hash chain broken at event 1
  (hash_mismatch)` (exit 1).
  **Same day, reachable from the existing UI too:** `collectAgentExportBundleFiles` now writes
  `runs/<runId>.receipt.json` (+ `.report.md`) for every turn in the "export diagnostic bundle" the
  header star already triggers — see the run-report task's note above for the wiring. **Owed:** the
  policy-IR snapshot and Token Ledger fields are not part of the receipt shape yet; no DEDICATED
  "export just the receipt" affordance exists (it only comes bundled with the full diagnostic export);
  and no receipt has actually been produced from a run executed through the shipped app this session —
  every validation so far (unit tests + the standalone-CLI check) used realistic fixtures built the same
  way `appendChainedEvent` would, not a live run's own database rows.)_
- [x] Standalone open-source **`tepegoz-verify` CLI**: re-folds events deterministically and validates the
      chain **without tepegöz installed** → PASS / FAIL / TAMPERED
      _(landed: [cli.ts](../../packages/notary/src/cli.ts), bundled to a dependency-free single file by [scripts/build-cli.mjs](../../packages/notary/scripts/build-cli.mjs). Verified in-session by running the BUILT output — `node dist/tepegoz-verify.mjs receipt.json` — against a genuine and a hand-tampered receipt, not merely by compiling the source. PASS/TAMPERED/INVALID/usage-error map to exit codes 0/1/2/3.)_
- [ ] Optional **opt-in** anchoring of the daily root hash to OpenTimestamps / RFC3161 (hash only, content never
      sent) for non-repudiation of WHEN (keeps local-first default) — not started
- [ ] _Risk:_ chaining over redacted payloads proves the redacted record is intact, not the original PII →
      hash the pre-redaction content into a sealed **local-only** digest so redaction is itself provable — not started; recorded as an open risk in [ADR-0030](../../docs/adr/0030-notary-service.md)
- [x] **An unsigned, human-readable run report — shippable BEFORE the wiring above, and that is the point.**
      Because nothing in `apps/desktop` calls the Notary yet, **no run produces any artifact at all today**.
      A single self-contained file per run (goal, each step with its tool call, arguments, result, latency
      and policy decision, screenshots inline, terminal reason, token cost) gives a user something to read,
      keep, diff and share now, and gives the signed Replay Receipt a concrete shape to grow into later.
      Three constraints keep it honest: it is **explicitly labelled "not a proof"** so it is never confused
      with a Replay Receipt; it runs the same Logger-grade redaction as the journal; and it is a _view over_
      journal events, never a second source of truth — the day the Notary is wired, the same events sign
      without the report changing shape.
      _(landed: [run-report.ts](../../packages/notary/src/run-report.ts) — `buildRunReport` structures one
      run's events (latency, terminal outcome, optional token usage) and `renderRunReportMarkdown` renders
      the document; both pure/tested, no redaction of their own since journal events are already redacted
      at append time. The desktop wiring —
      [ipc-agent-run-report.ts](../../apps/desktop/src/main/ipc/ipc-agent-run-report.ts) registers
      `agent:export-run-report`, reading the real `EventJournal`/`TokenStore` SCOPED to one `runId` and
      writing the rendered report to `~/tepegoz/` like the existing exports — is callable directly via
      `window.api.exportAgentRunReport`. **Reachable from the shipping UI, same day:** the header-star
      "export diagnostic bundle" button (`collectAgentExportBundleFiles`) now writes
      `runs/<runId>.report.md` for every turn in the session, sourced from the renderer's own Turn state
      (`panel-actions.ts`'s `onExportLog`) since main has no other way to know which runIds belong to a
      group. **Owed:** screenshots-inline is not yet in scope; there is still no DEDICATED "just this run's
      report" click — it arrives bundled with the full diagnostic export, not as its own icon.)_
      **Four separate tracks converged on this**, which is the strongest
      single signal in the parity set:
      [`../tracks/openai-cua-sample-agent-parity.md`](../../docs/parities/openai-cua-sample-agent-parity.md) P1,
      [`../tracks/nova-act-agent-parity.md`](../../docs/parities/nova-act-agent-parity.md) P1,
      [`../tracks/ui-tars-desktop-agent-parity.md`](../../docs/parities/ui-tars-desktop-agent-parity.md) P3,
      [`../tracks/playwright-mcp-agent-parity.md`](../../docs/parities/playwright-mcp-agent-parity.md) P5 (whose
      deterministic-replay variant stays gated behind the Notary wiring).
- [ ] **Outbound operational observability: signed webhooks + an optional trace hook.** The Notary answers
      "prove to a third party what happened"; this answers the different question "tell my systems, now,
      that it happened" — a run-finished / run-failed / HITL-requested webhook with an **HMAC signature over
      the body** so the receiver can verify origin, delivery retries with backoff, and an optional
      OpenTelemetry span export. Strictly **opt-in and off by default**: this is an egress path, so it
      re-enters the outbound-fetch destination guard ([phase-2](phase-2-adapters-safe-browsing.md) L10) and
      carries journal redaction — a webhook must never become the hole redaction was built to close.
      [`../tracks/skyvern-agent-parity.md`](../../docs/parities/skyvern-agent-parity.md) P1.

### L9 — Accountability Dashboard + deterministic causal explainer

- [ ] First-class Dashboard (not buried in Settings) folding the Journal into longitudinal views: per-domain
      access history, per-tool invocation counts + danger-class breakdown, every `PolicyBlocked` /
      `HitlRequested` / `HitlResolved` with reason codes, loop trips, egress blocks, token spend over time —
      per-profile isolated, virtualized
- [ ] Right-click any step → **"Explain this action"** produces a deterministic causal trace **without calling
      the model**: originating intent → DAG node planned-vs-actual → the exact sanitized perception snapshot
      that triggered it → policy classification + reason code → taint/provenance chain → which prior step's
      output fed this input
- [ ] The model only _optionally_ renders the deterministic facts into prose, **visually segregated** and
      labeled "generated"; the deterministic trace is always shown and is authoritative

### L2/L3/L8 — Counterfactual Dry-Run

- [ ] "Dry-Run" execution mode runs the full DAG in the existing **shadow workspace** with all
      state-changing/destructive/financial tools intercepted at the **Capability Broker** and replaced by
      deterministic simulations; the Effect Ledger records intended-but-not-executed effects
- [ ] Produces a human-readable **Consequence Report** ("will send 3 emails, delete 12 files, spend ~250 TL,
      touch these domains") before commit
- [ ] One-click **commit** replays the exact same plan for real; or **edit** (existing plan-preview HITL) and
      re-dry-run. Directly answers the #1 trust fear (zero-click Drive-wipe class)
- [ ] _Risk:_ simulation can't perfectly predict server-side outcomes → label simulated branches as estimates,
      re-validate read state at real-run time, keep HITL on destructive/financial even after dry-run

### L3/L7 — Pre-flight Cost & Risk Contract

- [~] Before any task runs, surface a binding **Run Contract**: estimated token cost (from the DAG cost
      estimator), highest danger-class node, count of HITL gates, which adapters/sites will be touched
      _(2026-09-15, three of the four corners landed. **Highest danger-class node:** the plan-preview
      modal (already a blocking pre-flight gate, `requestPlanApproval` in `ipc-agent-run.ts`) now carries
      each step's DECLARED `dangerClass` from `CapabilityRegistry`, and `panel-modals.tsx` renders it as
      a badge — read-only steps stay unbadged so the signal does not train the user to stop looking.
      Deliberately NOT the same axis as the six-tier `RiskTier` a HITL prompt shows later (`risk-tier.ts`'s
      own module doc: `dangerClass` is author-declared and static, `RiskTier` is derived from a step's
      actual arguments and not knowable before it runs) — a separate palette (`DANGER_CLASS_TONE`) keeps
      the two from being visually conflated. **Which adapters/sites will be touched:** the same preview
      now carries `sites` — deduped hostnames from `planGrantScope`'s existing URL-collection heuristic
      (entry tab + every URL found in a step's arguments), the SAME computation `mintPlanGrant` already
      used to size the approval grant, so the preview a user reads and the grant they approve can never
      silently disagree about scope. **Count of HITL gates (a FLOOR, not the total):** `guaranteedApprovals`
      — this turned out achievable without `resolveAutonomy`/the live Policy Kernel after all:
      `classifyRisk` (already used by `planGrantScope`) is a pure function of a step's declared
      `dangerClass` + its own arguments, so calling it per step and counting how many land in
      `NEVER_AUTO_GRANTABLE_TIERS` gives an ALWAYS-TRUE lower bound — those tiers prompt under every
      autonomy level, no exceptions, so this can never overclaim. Rendered only when > 0. **Not
      attempted:** the token-cost estimate (no DAG cost estimator exists anywhere in the codebase yet — a
      real modeling exercise, not a wiring one, and a wrong estimate would be worse than none) and the
      post-run verifiable refund diff.)_
- [ ] User accepts (recorded as an event); on failure/loop/abort the Token-Ledger auto-refund is shown as a
      reconciled before/after with a verifiable diff ("promised ≤X, spent Y, refunded Z"), replayable from the
      Journal — weaponizes competitors' #1/#2 cost complaints (no refund, no pre-cost telegraphing)

### L1/L2/L6 — KVKK/GDPR self-service + living Compliance Pack

- [~] **Data Rights** panel treating the local Journal + memory + blob store as a queryable personal-data
      corpus: enter a subject (email/domain/name/profile) → deterministic search across events, FTS5 memory,
      CAS blobs → a portable **SAR export bundle** (machine- + human-readable, en+tr)
      _(2026-09-15, first slice landed — READ-ONLY, erasure deliberately not attempted in the same pass:
      [subject-access-search.ts](../../apps/desktop/src/main/privacy/subject-access-search.ts) +
      [ipc-data-rights.ts](../../apps/desktop/src/main/ipc/ipc-data-rights.ts) register
      `privacy:data-rights-export`. Searched Agent Conversation turns
      (`AgentConversationStore.searchTurnsForSubject`, reusing the exact folded-`LIKE` + Turkish
      `foldForSearch` contract `list()` already uses — no new search rule to drift from) and the full
      Event Journal (`searchEventsForSubject`, JS-side since the journal has no fold-column index —
      unbounded `EventJournal.readFrom(db, 0)`, a known scaling limit worth revisiting once a real
      install has years of history). Writes a self-contained Markdown SAR document to `~/tepegoz/`.
      Deliberately NOT gated behind the agent-enabled guard: past data stays exportable even after the
      extension is turned off.
      **Same day, three more dimensions added.** Browsing History (`HistoryStore.search`) and Bookmarks
      (`BookmarkTreeStore.search`, which also matches on tags — a small bonus this module didn't have to
      build), each the SAME folded-LIKE query its own page already runs. Then **Downloads**
      (`searchDownloadsForSubject`, JS-side over `DownloadStore.list` — downloads have no fold-column
      index either, so this one follows the Journal's pattern rather than History/Bookmarks'). **Every
      source with an existing search contract to reuse is now covered.** Only the CAS blob store remains
      — genuinely out of scope, since blobs are hash-addressed opaque bytes with no text to search. No
      UI affordance — devtools-console-only via `window.api.exportDataRights({ subject })`, same
      starting point every other Phase 7 export took
      before its own UI-reachability pass. i18n: none needed yet (no renderer strings — the export is a
      file, not a rendered surface).)_
- [ ] **Provable erasure**: tombstone events + blob-refcount decrement + memory-audit purge, recorded as
      append-only "erasure performed" events so deletion is itself provable (reuses the `kv` tombstone column
      already in schema v1)
- [ ] Retention-policy engine + a **Compliance module** that auto-generates, from live config/usage, the
      EU-AI-Act / KVKK artifacts (register of processing, per-provider model cards, human-oversight statement
      from Policy Kernel + HITL stats, data-flow map)
- [ ] _Risk:_ append-only vs right-to-erasure tension → erasure = crypto-shred blob bytes + redact event
      payloads to tombstones while preserving the erasure event (lawful record-of-processing); generated docs
      framed as evidence/templates with an explicit "not legal advice" disclaimer

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/receipt/CLI-input trust boundary; AppError
      contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution trailer**
