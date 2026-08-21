# Phase S0 — Truth & Repair (Foundation)

**Status:** 🟠 **Measurement-owed** — PR0–PR3 landed 2026-08-16 (the entire drift repair, all
funding-independent); PR4–PR6 are the ⏸ funded full-registry sweep · **Depends on:** — (first phase of
v3) · **Track:** [AI Agent Super](README.md)

**Goal:** Make this folder the **single authoritative** AI competence roadmap and repair the three-way
drift between docs, code, and numbers before any capability work opens. Absorb the still-valid machinery
of the retired v2 [`../ai/`](../ai/) track, restore the deleted v1 archive, kill the stale index that
hides three breached anti-debt rules, and delete the knowingly-wrong regenerable report artefact. Then
produce the first **honest full-registry baseline** (all 52 scenarios, N=3, Anthropic product tier) whose
**failure taxonomy may re-order this very program** — the same pre-registered humility M1 carried.

## Why

The evidence is a documented, reproducible drift across three surfaces:

1. **The v1 archive was deleted.** Commit `e900567` removed `phases/ai/archive/` — 10 v1 documents
   including the `browser-use`/`nanobrowser` build-vs-buy record and the full v1 measurement history —
   leaving **~15 broken `archive/` links** across `phases/ai/*` (e.g. the retired `phase-ai-m1`
   referenced `archive/README-v1.md` and `archive/phase-ai-1-eval-harness.md`). The content is
   recoverable verbatim: `git show 49396c5:phases/ai/archive/<file>`. The build-vs-buy decision itself is
   already preserved in [`history.md`](history.md); the rest of the archive is not.
   **→ Closed by PR1:** the 10 files are restored under [`archive/`](archive/README.md), their links
   repaired (including code links broken since the original demotion into `archive/`).

2. **The index lies about landed work.** [`../ai/README.md`](../ai/README.md) shows **C1
   "Measurement-owed"** and **M1 / C7 "Not started"**, but M1-PR1 (`e01691b`, `f9e639d`), **all** C1 PRs,
   and C7-PR1 (`1403a05`, `4cf2caa`, `54848f4`) are **landed**. The constitution's **anti-debt rule
   (≤1 measurement-owed at a time)** is already breached **×3**, hidden by the stale index. A roadmap that
   miscounts its own debt cannot gate honestly.

3. **A knowingly-wrong report sits at the repo root.** `agent-eval-report.json` carries pre-correction
   numbers (`sitemap_only_route` 0/3, `silent_api_failure` 0/3, pooled 3/10) that the transport-invalid /
   dead-key exclusion logic (`isTransportInvalid`, `isDeadKeyError`, `UNMEASURED`) already superseded —
   the corrected reading is 3/7. It is a **regenerable artefact** masquerading as a source of truth.
   **→ Correction (PR3, on the record):** this phase drafted the item as _"a knowingly-wrong report is
   **committed**"_. It was not. `git ls-files` and `git log --all -- agent-eval-report.json` both come
   back empty, and `.gitignore` already carried `agent-eval-report.json` + `agent-eval-runs/` before this
   program began — so `git rm` had nothing to remove. The **hazard was real but local**: a wrong number
   lying at the repo root where a reader takes it for truth. PR3 deletes the local file (byte-identical
   to the archived run `agent-eval-runs/2026-07-25T12-34-44-813Z-live.json`, so nothing was lost) and
   documents the regenerate command instead. Recorded rather than quietly re-scoped — a phase that
   miswrote its own evidence must say so.

4. **A referenced architecture doc does not exist.** [`../../CLAUDE.md`](../../CLAUDE.md) and
   [`../README.md`](../README.md) both point at `docs/ARCHITECTURE.md`, which is **absent**. The real
   layer model (L0–L10) lives in [`../../README.md`](../../README.md); the L7 model detail lives in
   [`../../docs/technical-ai-doc.md`](../../docs/technical-ai-doc.md). A dangling pointer in the binding
   working-agreement is exactly the drift this phase exists to close.

5. **Only 5 of 52 scenarios have ever been measured live** ([`eval-results.md`](eval-results.md)). The
   Anthropic (DoD) tier N=3 run showed **0% escape** — failures are **on-page** (wrong / incomplete
   answer), not escape — which is precisely why v2's C1 escape-gate priority was mis-cut. `cookie_consent`
   is 0/3 and **undiagnosed**; the judge holds **1 of 25** calibration labels; **0 of 4** north-star
   conditions carry a number. There is no honest denominator for this program to divide its deltas by.

S0 is pure git + docs surgery plus one funded baseline. It authors **no capability code and no new
fixtures** — that is the point: freeze the exam before writing the answers.

## Exit criteria (DoD)

- [x] **Zero broken `archive/` links** — `git grep -n 'archive/'` across `phases/` resolves to a real
      file for every hit (the archive restored under this folder, links repointed). _Verified stronger
      than the gate asked: **every relative link across all `phases/**/*.md` resolves, 0 broken.**_
      The gate is now executable — `pnpm docs:links` ([`scripts/check-doc-links.mjs`](../../scripts/check-doc-links.mjs),
      wired into CI) re-measures it on every push. _This line originally recorded a hand-counted "839
      links". That number is not reproducible — the same tree measures 870 — so it was replaced with
      the invariant plus the command that proves it, rather than a figure a later auditor would read as
      drift._
- [x] **Zero index-drift items** — every phase status in the new [`README.md`](README.md) index audited
      against `git log`; no phase whose code has landed still reads "Not started"; the
      **measurement-owed count is restored to ≤1** (constitution anti-debt rule satisfied on the record).
      _See the [status-truth audit](README.md#status-truth-audit-s0-pr2-2026-08-16--what-is-actually-landed):
      M1 + harness robustness absorbed (no debt), C1 and C7-PR1 sweeps folded into S0's one baseline →
      **1 measurement-owed**._
- [x] **The retired v2 phase docs are gone and their machinery absorbed** — `phases/ai/phase-ai-{m1,m2,c1..c7,f1..f3}.md`
      deleted; `constitution.md`, `eval-results.md`, `PROSE-LEDGER.md`, and the eval-loop runbook live
      under this folder; [`../README.md`](../README.md)'s "AI" row points at [`README.md`](README.md).
      _`phases/ai/README.md` remains as a tombstone stub recording where every item went._
- [x] **The regenerable report is not tracked** — root `agent-eval-report.json` removed from the tree and
      added to `.gitignore`; a documented regenerate command exists. _Both git conditions were already
      satisfied (never tracked, already ignored — see the [Why §3 correction](#why)); the local file is
      deleted and the [regenerate command](eval-loop-runbook.md#regenerating-the-report-never-commit-it)
      is documented, with the `.gitignore` entry now carrying the reason it must stay ignored._
- [x] **The `docs/ARCHITECTURE.md` reference resolves** — the **file is created** (mirroring the L0–L10
      model from [`../../README.md`](../../README.md) + L7 from
      [`../../docs/technical-ai-doc.md`](../../docs/technical-ai-doc.md)); the PR records the choice and
      its reason. _`CLAUDE.md`'s stale "mirrors the approved plan" gloss and `phases/README.md`'s
      "to be moved into the repo" note are corrected to match what now exists._
- [ ] **First-ever full-registry baseline** in [`eval-results.md`](eval-results.md): **all 52 scenarios**
      (incl. the 24 `atk_*` — the first live adversarial numbers), Anthropic tier, **N=3**, per-family
      **Wilson 95% CIs**, **$/trial**, and **wall-clock/trial**, with flaky + transport-invalid /
      dead-key exclusions applied so launch flakiness does not deflate k/N. **(⏸ funded sweep)**
- [ ] **Failure-taxonomy doc** naming the **top-5 failure classes** with **trial-transcript citations**
      per class. **(⏸ funded sweep)**
- [ ] **Re-cut checkpoint held on the record** — if the taxonomy disagrees with this program's
      S2/S3-first ordering, the program is re-ordered and the change recorded; if it agrees, that is
      recorded too. **(⏸ funded sweep)**
- [ ] **`cookie_consent` trace-level diagnosis** written to the taxonomy doc — root cause named from
      transcripts, **no fix** (the fix is [S3](phase-s3-reliability-actions.md)'s). **(⏸ funded sweep)**
- [ ] **Ledger + constitution hygiene** — the baseline entry records its **actual $/trial** (the
      constitution's "no sweep without a recorded cost" rule); the order-of-magnitude estimates in
      [`README.md`](README.md)'s budget table are replaced with actuals in the same entry. **(⏸ funded sweep)**
- [x] **Constitution compliance** — no new fixtures introduced (freeze-before-capability honoured by
      construction); no prose deleted (no paired-sweep obligation incurred); **i18n:** none (dev-only
      harness + docs; any Agent Console string touched → EN + full TR in the owning dict).
      _Verified across PR0–PR3: zero scenarios added (recorded in [`fixture-freeze.md`](fixture-freeze.md));
      all seven [`PROSE-LEDGER.md`](PROSE-LEDGER.md) rows still RETAINED, no `BROWSING_STRATEGY` steer
      touched; no user-facing string touched — the only non-doc edits were `.gitignore` and a package
      README pointer._

## Tasks

### PR0 — fixture freeze (no-op, on the record)

- [x] State explicitly in the PR body that S0 adds **zero** scenarios to
      [`../../packages/agent-eval`](../../packages/agent-eval) — the frozen 52-scenario / 8-registry set is
      the baseline exam. Record the exact registry file list + a content hash so later phases prove they
      measured against this frozen base. → **[`fixture-freeze.md`](fixture-freeze.md)** (8 files, 52
      scenarios incl. 24 `atk_*`, per-file SHA-256, regenerate command).

### PR1 — restore the v1 archive + repair links

- [x] Restore all 10 files: `git show 49396c5:phases/ai/archive/<file>` → write under
      **`phases/ai-agent-super/archive/`** (this folder owns history now; the build-vs-buy summary already
      lives in [`history.md`](history.md) and stays the canonical short form — the archive is the long form).
- [x] Repoint every `archive/` link. The dangling references live in the v2 phase docs about to be
      deleted in PR2, so scope PR1 to links that **survive** (in [`history.md`](history.md),
      [`README.md`](README.md), and any retained runbook); `git grep -n 'archive/'` must resolve clean at
      PR2 close.
- [x] Add a one-line archive `README` noting provenance (restored from `49396c5`, deleted by `e900567`).

### PR2 — retire the v2 track, absorb its machinery

- [x] Delete `phases/ai/phase-ai-m1-measurement-baseline.md`, `-m2-external-yardstick.md`,
      `-c1..-c7`, `-f1..-f3` (13 phase docs). Their residual scope is already mapped in
      [`README.md`](README.md#old-v2--new-s-residual-scope-map); nothing is silently dropped.
- [x] Confirm the spine files already created here — [`constitution.md`](constitution.md),
      [`eval-results.md`](eval-results.md), [`PROSE-LEDGER.md`](PROSE-LEDGER.md),
      [`history.md`](history.md) — and **remove the originals** under `phases/ai/`; move the eval-loop
      runbook to this folder and repoint the [`README.md`](README.md#operations) link (currently
      `../ai/eval-loop-runbook.md`).
- [x] **Status-truth pass:** audit every landed AI PR against `git log`, correct the
      [`README.md`](README.md) phase index, and bring the **measurement-owed count to ≤1** — the C1 code
      is landed, so its exit sweep folds into S0's baseline; M1/C7 machinery is landed and recorded as
      absorbed, not "Not started".
- [x] Update [`../README.md`](../README.md)'s "AI" row to point at [`README.md`](README.md) (the sole
      authoritative roadmap), leaving `phases/ai/` as a tombstone dir (README stub only).

### PR3 — kill the wrong artefact + fix the architecture pointer

- [x] ~~`git rm` the root **`agent-eval-report.json`**; add it (and the run-report glob) to
      `.gitignore`~~ — **both already true** (see the [Why §3 correction](#why)): the file was never
      tracked and `.gitignore` already carried `agent-eval-report.json` + `agent-eval-runs/`. The **local**
      file is deleted (byte-identical to its archived run, nothing lost), and the regenerate command is
      documented in [`eval-loop-runbook.md`](eval-loop-runbook.md#regenerating-the-report-never-commit-it)
      against the [`../../packages/agent-eval`](../../packages/agent-eval) `_electron` driver, so the
      number is reproducible on demand and never committed.
- [x] Resolve the `docs/ARCHITECTURE.md` reference. **Chosen: the preferred option — the file is
      created.** [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) is a thin index mirroring the
      L0–L10 model from [`../../README.md`](../../README.md) and linking the L7 detail in
      [`../../docs/technical-ai-doc.md`](../../docs/technical-ai-doc.md) — **no new content**, every row
      points at the document that owns the material, single source of truth preserved. _Why preferred over
      the repoint fallback:_ the pointer appears in the **binding** working agreement
      ([`../../CLAUDE.md`](../../CLAUDE.md)) as _the_ architecture entry point, and repointing it at the
      product README would send an engineer looking for the layer model into marketing prose. The index
      also records that **`docs/ROADMAP.md` is deliberately not created** — [`../`](../README.md) already
      is the roadmap.

### PR4 — first full-registry baseline (⏸ funded)

- [ ] Run the **52-scenario** registry (all 8 files, incl. 24 `atk_*`) on the **Anthropic product tier**
      (`claude-opus-4-8` plan / `claude-sonnet-4-6` exec / `claude-haiku-4-5` classify), **N=3**, via the
      [`../../packages/agent-eval`](../../packages/agent-eval) `_electron` driver (`TEPEGOZ_EVAL=1`) with
      `TEPEGOZ_EVAL_RATES` set for real $/trial capture.
- [ ] Rely on the already-landed exclusions (`isTransportInvalid`, `isDeadKeyError`, `UNMEASURED`,
      `navigateWhenReady` readiness barrier) to keep flaky launches out of k/N — verify no legitimately
      failed trial is mis-tagged `UNMEASURED` by spot-checking the excluded set against transcripts.
- [ ] Emit per-family **Wilson 95% CIs**, **$/trial**, **wall-clock/trial** via
      [`statistics.ts`](../../packages/agent-eval/src/statistics.ts) family pooling; the 24 `atk_*` yield
      the **first live adversarial ASR numbers** (recorded as k/K + binomial upper bound, N=3 caveated —
      claim-grade ASR is [S6](phase-s6-safety-control-plane.md)'s N≥10 job).

### PR5 — ledger entry + failure taxonomy + re-cut checkpoint (⏸ funded)

- [ ] Dated entry in [`eval-results.md`](eval-results.md): per-family baseline table (k/N, Wilson CI,
      $/trial, wall-clock/trial for all 52) + the actual sweep cost; replace the budget-table estimates in
      [`README.md`](README.md) with the measured $/trial actual.
- [ ] Write the **failure-taxonomy doc** (new file in this folder): the **top-5 failure classes** ranked
      by frequency across the 156 trials, each with ≥2 trial-transcript citations; explicitly confirm or
      refute the 5/52 finding that Anthropic-tier failures are **on-page, not escape**.
- [ ] **Re-cut confirmation:** compare the taxonomy's top classes against this program's
      **S2 (perception) / S3 (reliability) -first** ordering. If they disagree, re-order the program in
      [`README.md`](README.md) and record the delta; if they agree, record the agreement. Same
      pre-registered humility M1 carried — the data outranks the plan.

### PR6 — cookie_consent diagnosis (⏸ funded, no fix)

- [ ] From the baseline transcripts, diagnose why `cookie_consent` sits **0/3** — name the mechanism
      (occlusion at snapshot time, missing dialog handling, ref invalidation, banner outside the scan cap,
      etc.) and write it into the taxonomy doc as [S3](phase-s3-reliability-actions.md)'s owned input.
      **No behaviour change lands here** — S0 authors no capability code.

## Fixtures

**NONE new.** This is the freeze-before-capability boundary: S0 measures the existing frozen
52-scenario / 8-registry set exactly as it stands and records its content hash. Every later phase adds
its exam in its own PR0 and proves it measured against this frozen base.

The freeze is on the record in **[`fixture-freeze.md`](fixture-freeze.md)** — the 8 registry files, their
per-file scenario counts (52 total, incl. the 24 `atk_*`), their SHA-256 hashes, and the command that
regenerates the table. Later phases cite that file as the base their delta is measured against.

## Prose steers

**None.** S0 deletes no capability prose and adds none, so it incurs no paired with/without-sweep
obligation under the consolidation-as-DoD rule. (Deleting the retired v2 _phase docs_ in PR2 is roadmap
surgery, not a `BROWSING_STRATEGY` steer removal — no [`PROSE-LEDGER.md`](PROSE-LEDGER.md) row is
retired.)

## ADR

**None.** S0 is git + docs + one measurement run; it changes no architecture and needs no decision
record. (The first new ADR of this program, **0025**, is authored by [S1](phase-s1-foundation-native-loop.md).)

## Risks

- **Funded key unavailable → PR4–PR6 are hard-blocked.** The whole program's measurement rests on this
  baseline; without the key S0 cannot reach ✅ and legitimately rests at 🟠 measurement-owed after
  PR1–PR3 land. _Mitigation:_ PR0–PR3 (the entire drift repair) are **funding-independent** and land day
  one, restoring anti-debt compliance immediately; the sweep is the only ⏸ portion. This is the owner's
  accepted posture (plan-without-budget), not drift.
- **Flaky live sites deflate k/N.** _Mitigation:_ the already-landed `isTransportInvalid` /
  `isDeadKeyError` / `UNMEASURED` classification + `navigateWhenReady` readiness barrier keep
  launch/transport failures out of the denominator; PR4 spot-checks the excluded set against transcripts
  so a genuine failure is never laundered into `UNMEASURED`.
- **Restoring the archive re-introduces stale internal links.** _Mitigation:_ PR1 restores content but
  only repoints links that survive PR2's deletions; the exit gate is a clean `git grep 'archive/'`
  measured **after** PR2, not before.
- **The re-cut could invalidate downstream phase drafts.** _Mitigation:_ this is a feature, not a bug —
  the checkpoint is pre-registered (PR5) and the residual-scope map in [`README.md`](README.md) makes
  re-ordering a table edit, not a rewrite. Spike-first is unnecessary; the taxonomy _is_ the spike.
