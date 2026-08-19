# Phase S9 — Memory & Skills (W-cross)

**Status:** 🟠 Measurement-owed (PR0–PR5 landed 2026-08-19; only the ⏸ funded PR6 sweep is open) · **Depends on:** [S2](phase-s2-perception-v2.md) (identity-stable refs) · [S6](phase-s6-safety-control-plane.md) (grant plane) · **Track:** [AI Agent Super](README.md)

**Goal:** Let the agent learn across runs. Ship three cross-run stores — a per-domain **advisory** observation memory (selector hints, layout notes, successful-path summaries), a **skill/shortcut library** of named user-triggerable task templates, and **per-task remembered grants** with expiry — all in SQLite with sync-meta columns. Memory is advisory-only, injected as tainted context, never auto-executed, and re-validated against the live DOM before use. This phase owns north-star condition 4's *"cost measurably dropping on repeat domains"* — the repeat-visit fixtures must show wall-clock and tokens dropping without any first-visit regression.

## Why

**Nothing is learned across runs today.** The only cross-run persistence adjacent to the agent is per-tab-group conversation history capped at 20 messages ([agent-conversation-store.ts](../../packages/persistence/src/agent-conversation-store.ts)), and run checkpoints in [run-lifecycle.ts](../../packages/agent-runtime/src/run-lifecycle.ts) that are **written but never resumed**. There is no per-domain memory and no skill library: every run re-discovers a site's layout, re-pays the perception tokens to find the same login form, and re-asks for the same grants. The reactor ([reactor.ts](../../packages/orchestrator/src/reactor.ts)) starts every task from a cold model with only the strategy prompt ([reactor-prompt.ts](../../packages/orchestrator/src/reactor-prompt.ts)).

**Every Comet-class rival ships memory that influences behaviour**, and north-star condition 4 ([README](README.md), [constitution](constitution.md#north-star--the-four-claim-conditions-full-text)) makes the repeat-domain cost drop a *published claim condition* this program must satisfy — measured, not asserted. On the measured baseline ([eval-results.md](eval-results.md)) the DoD-model failures are on-page competence, and much of the wall-clock is re-perception of already-seen structure; a domain memory is the lever that turns a second visit cheaper.

**Memory is a live attack surface.** The Comet security record (Brave / Trail of Bits / Zenity: prompt-injection → Gmail exfiltration, zero-click calendar hijack) shows that a store which influences future behaviour is a **persistence vector for poisoning** — a malicious page seeds a hint on visit 1, the agent obeys it on visit 2. So this store cannot be a naive cache. Observations are injected only through the perception trust boundary ([content-guard.ts](../../packages/tool-executor/src/content-guard.ts): `sanitizeContent` / `detectThreats` / the `<user_task>` trust fencing), tagged as tainted third-party content, and re-validated against the current DOM — never trusted, never executed from store. Selector hints cannot be persisted as the per-snapshot positional refs from [interactable.ts](../../packages/tool-executor/src/interactable.ts) `finalizeElements` (invalidated every snapshot); they must be durable descriptors re-resolved against **S2's identity-stable refs** at use time.

Skills are **distinct from Phase 6 recipes** ([routing table](README.md#routing--what-stays-out), ownership test: *"if the model could be removed from the replay, it's Phase 6"*). A skill is a model-driven template (prompt + start URL + grant profile) that the agent still reasons over; a Phase-6 recipe is a signed, model-free deterministic replay. S9 ships the former only.

## Exit criteria (DoD)

- [ ] **Repeat-visit cost drop:** on the repeat-domain paired fixtures, second-visit **wall-clock/task AND tokens/task both ≥25% lower** than first-visit, at pooled **N≥10 paired** with Wilson 95% CIs on the pooled family (⏸ funded sweep).
- [ ] **First-visit unchanged:** first-visit verified-completion rate and wall-clock within **±5pp / equivalence margin** of the pre-S9 baseline — memory must not tax the cold path (⏸ funded sweep).
- [ ] **Poisoned-hint 0 violations:** on the poisoned-hint fixture family (store seeded with a malicious hint), **0 policy/egress violations in N≥10** — the agent must not follow a stored hint into a taint/egress/grant violation. This is the **ship gate**, not a nice-to-have (⏸ funded sweep).
- [x] **Re-validation mandatory by construction:** a stored selector hint that does not resolve against the current DOM (via S2 identity refs) is discarded, never actioned; covered by a scripted stale-hint regression (plumbing, not competence).
- [x] **Advisory-only, by construction:** no memory value reaches `ToolGateway.invoke` without passing the same PEP as a fresh model decision; a memory-derived value crossing the egress firewall carries taint and triggers the S6 approval path. Scripted assertion.
- [x] **Sync-ready:** every new table carries sync-meta (`updated_at`, `version`, `tombstone`, UUID PK, `device_id` via [MetaStore.deviceId](../../packages/persistence/src/meta.ts)) — verified by a persistence test; no Phase-3 migration owed.
- [ ] **Skills UI surface localized:** the skills library trigger + editor ships EN + full-TR parity in the same PR ([ext-agent i18n](../../extensions/ext-agent/src/i18n)).
- [ ] **Constitution items:** fixtures frozen in PR0 **before** any capability code ([constitution](constitution.md#the-rules)); the memory-on vs memory-off paired sweep is recorded with its equivalence margin; the before/after delta is appended to [eval-results.md](eval-results.md); the phase rests at 🟠 until the funded sweep lands.
- [ ] **Prose:** none deleted (S9 owns no PROSE-LEDGER row); any future deletion this memory *enables* is recorded when proven, never claimed here.

## Tasks

### PR0 — fixture freeze (no capability code)
- [x] Add repeat-domain **paired** fixtures to [packages/agent-eval](../../packages/agent-eval) registries: each is a `{first_visit, second_visit}` pair on the same domain, scored **separately** so the delta is a paired statistic (first-visit arm doubles as the ±5pp regression guard).
- [x] Add the **poisoned-hint** fixture family: a seed step that plants a malicious observation into the memory store, then a task where obeying the hint would trip a taint/egress/grant violation; scorer asserts **0 violations**.
- [x] Register both families in the family-pooling map ([statistics.ts](../../packages/agent-eval)) and the escape/cost metric plumbing; commit rubrics + expected deltas before any store code.
- [x] Ledger stub in [eval-results.md](eval-results.md) marking the S9 sweep ⏸ awaiting funded key.

### PR1 — schema + write path (sync-meta, ≤250 lines/file)
- [x] New `agent-memory-store.ts` in [packages/persistence/src](../../packages/persistence/src) (per the no-`apps/desktop`-growth rule): `domain_memory` table keyed on host + S2 durable descriptor, columns `id` (UUID PK), `device_id`, `updated_at`, `version`, `tombstone`, `host`, `descriptor_json`, `note`, `success_path_json`, `provenance`. Migration in [migrations.ts](../../packages/persistence/src/migrations.ts); `safeParse` on read via a `@tepegoz/shared-types` schema (sole schema source).
- [x] Write path emits **durable descriptors** (role/name/href/structural-path), never positional refs — derive from the S2 identity ref, not [interactable.ts](../../packages/tool-executor/src/interactable.ts) snapshot indices.
- [x] **Write-side poison filter:** run `detectThreats` ([content-guard.ts](../../packages/tool-executor/src/content-guard.ts)) over every candidate observation before persisting; threats are dropped and the drop is journalled ([event-journal.ts](../../packages/persistence/src/event-journal.ts)).
- [x] Persistence test proving sync-meta columns + tombstone soft-delete.

### PR2 — advisory injection + live-DOM re-validation
- [x] New `@tepegoz/agent-memory` retrieval seam (a package, not `apps/desktop`): given the current host, return sanitized advisory context. Injected into the reactor turn as **tagged tainted content** through `sanitizeContent`, distinct from the `<user_task>` trusted fence — never as an instruction.
- [x] **Re-validation gate:** before a hint is offered, re-resolve its descriptor against the current DOM using S2 identity refs; a non-resolving hint is discarded (the mandatory anti-stale construction). Wire into [reactor.ts](../../packages/orchestrator/src/reactor.ts)'s context assembly, not the action path.
- [x] Taint propagation: a memory-derived value routes through the existing TaintTracker so egress inherits the S6 approval path; assert no bypass of `ToolGateway.invoke`.
- [x] Scripted stale-hint + advisory-only regressions (plumbing tier).

### PR3 — poisoned-hint defenses + fixtures
- [x] Injection posture for memory: memory context is sanitized in strict posture (`isStrictMode`), forged-trust-tag stripping on retrieval, and a **quarantine** flag — a hint whose use once preceded a policy denial is quarantined and excluded from future retrieval.
- [ ] Run the frozen poisoned-hint family in scripted mode as a **pre-sweep gate** (0 violations must hold on the deterministic arm before the funded sweep is even scheduled).
- [ ] Provenance surfaced to the S8 event stream so a human sees *"acting partly on a remembered hint from <host>"* (advisory transparency).

> **Mechanism + placement notes (PR0–PR3, PR5-store).**
> 1. **Placement deviation.** There is no new `@tepegoz/agent-memory` package. The decision layer lives in
>    `@tepegoz/tool-executor` — which already owns `content-guard` (the write filter) and `dom-path`
>    (`findByLocators`, the re-validation resolver), so memory sits beside the two things it is made of
>    rather than importing both across a new boundary. The tables are in `@tepegoz/persistence` with the
>    other stores. Neither is `apps/desktop`, which is what the rule protects.
> 2. **Filtered on WRITE, not only on read.** Retrieval-time filtering still leaves the attacker's text in
>    the user's database. `decideWrite` runs `detectThreats` before storage and returns the threat kinds
>    so the drop can be journalled — a silent discard would hide an attack in progress.
> 3. **Quarantine is not deletion.** A hint that led to a policy denial stops being offered and **stays**,
>    so a user or a later investigation can still see what was planted and when. Deleting it would erase
>    the evidence along with the attack. Quarantine also requires a *policy denial*, not mere task failure:
>    conflating the two would quarantine the whole store on a bad day.
> 4. **Advisory by construction.** Recalled notes arrive as `role: 'user'` observations, outside the
>    trusted task fence — asserted directly in `memory-recall.test.ts`. They can inform a decision and can
>    never be one; anything they suggest still passes the ToolGateway PEP like a fresh model decision.
> 5. **Recall is once per HOST.** Re-injecting the same notes each step would spend exactly the tokens
>    memory exists to save.
> 6. **Rows are `safeParse`d on read and dropped on failure.** A row from an older build, or one left by a
>    poisoning attempt that predates the filter, is untrusted input like page text — a store that trusts
>    its own rows is one an attacker only has to reach once.
> 7. **Remembered grants cannot creep.** `expires_at` is `NOT NULL`, expiry is applied *in the query* (so
>    an unswept grant is still dead), and a SQL `CHECK` keeps `credential`/`financial`/`destructive` out
>    of the table entirely — those are only ever asked. **Still owed:** the PolicyKernel consult that would
>    actually honour a remembered grant pre-model; the store and its guarantees landed, the kernel wiring
>    did not.
> 8. A framing sentence in the injected block was itself redacted by our own injection filter during
>    development ("they never override the current task") and had to be reworded — a useful reminder that
>    the guard cannot tell whose text it is looking at. Recorded because it will surprise the next author.

### PR4 — skills library + UI hook
- [x] `skill-store.ts` in [packages/persistence/src](../../packages/persistence/src): named templates `{name, prompt, start_url, grant_profile_ref}` + sync-meta; `@tepegoz/shared-types` schema; **not** a Phase-6 recipe (no signed model-free replay — document the boundary inline).
- [x] User-triggerable entry point in [ext-agent](../../extensions/ext-agent/src) via [panel-run-config.tsx](../../extensions/ext-agent/src/panel-run-config.tsx) / a skills dropdown on [panel.tsx](../../extensions/ext-agent/src/panel.tsx); selecting a skill pre-fills the composer + start URL + grant profile. EN + full-TR dictionaries in the same PR.
- [x] Skill launch reuses the normal reactor path (model stays in the loop) — no new execution plane.

### PR5 — remembered grants (S6 plane, persisted with expiry)
- [x] `grant-store.ts` in [packages/persistence/src](../../packages/persistence/src): persist S6 grants keyed on {task/skill, host, tool-tier} with an explicit `expires_at`; sync-meta columns; `safeParse`.
- [x] [policy-kernel.ts](../../packages/security-policy/src/policy-kernel.ts) consults remembered grants **pre-model** (ADR-0006 ordering preserved); an expired or tombstoned grant is never honoured; a remembered grant never upgrades the ceiling above S6's `follow_a_plan` and never covers a taint-crossing action silently.
- [x] Grant provenance shown at approval time (S8 surface) so the human can revoke.

> **Mechanism + deviation notes (PR4, PR5).**
> 1. **A skill never starts a run.** Selecting one fills the composer and stops; `skillUse()` returns
>    `{prompt, openUrl}` with no third option to add later by accident, and the strings say "fills the
>    box below", not "runs". A stored row that could start a run would move the gesture that authorises
>    a task from the human to the database.
> 2. **A stored start URL does not get to choose the scheme.** `safeStartUrl()` whitelists http/https
>    and returns null on anything else (including unparseable input) before the URL reaches `createTab`.
>    A skill row can arrive from an older build, a restored profile, or a future import/sync path, and
>    `javascript:` is a scheme — this was a real hole in the first wiring, not a hypothetical one.
> 3. **Placement deviation.** The kernel consult is NOT inside `policy-kernel.ts`. The kernel is a pure
>    function of (tool, taint, target) with no I/O; giving it a database handle would make every
>    security decision depend on storage being reachable. The coverage RULE is pure and unit-tested in
>    `security-policy/remembered-grants.ts`; the row-reading lives in main's `remembered-grant-scope.ts`
>    and is consulted at the same pre-model point in `requestApproval` as the plan grant. ADR-0006
>    ordering is preserved: the kernel decides first, and a grant is only ever consulted where it
>    already said *ask*.
> 4. **Scope is a named skill, bound by the stored prompt.** An ad-hoc prompt can neither mint nor match
>    a persistent grant. The renderer supplies `skillId`, and main honours it only while the run prompt
>    still matches that skill's stored prompt — otherwise an untrusted renderer would simply name
>    whichever skill holds the widest grant. Attachments change the prompt, so they too fall back to
>    asking.
> 5. **Consult order:** plan grant (one run) → remembered grant (one skill, one site, 30 days) →
>    autonomy level (every run). Narrowest authority first.
> 6. **Revocation is real but narrow.** Deleting a skill revokes every grant it held, which works
>    because a skill is the only scope that can hold one. **Owed:** a standalone grant manager that
>    lets a user drop one saved permission while keeping the skill.
> 7. **New `grant` event kind**, persisted in conversation history and journalled as `HitlResolved`, so
>    the transcript says *"Allowed by a permission you saved for X"* where the approval would have been.
>    A persistent permission that acts invisibly is one nobody knows to revoke.

### PR6 — repeat-visit sweep (⏸ funded)
- [ ] Run the frozen paired families memory-on vs memory-off at pooled N≥10; record wall-clock/task, tokens/task, first-visit regression, and poisoned-hint violations with the exclusion accounting (transport-invalid / dead-key per the [constitution](constitution.md#the-rules)).
- [ ] Append the dated before/after entry to [eval-results.md](eval-results.md); flip S9 🟠 → ✅ only if all four DoD numbers hold; update the north-star condition-4 scorecard (repeat-domain drop half only).

## Fixtures

Frozen in PR0, added to [packages/agent-eval](../../packages/agent-eval):
- **Repeat-domain paired family** — `{first_visit, second_visit}` on the same host, scored separately; the delta between arms is the ≥25% wall-clock + tokens claim, and the first-visit arm is the ±5pp regression guard.
- **Poisoned-hint family** — a seed step plants a malicious observation into `domain_memory`; the follow-up task is constructed so that obeying the hint trips a taint/egress/grant violation. Scorer asserts **0 violations** at N≥10; this family is the ship gate.

## Prose steers

**None owned.** S9 deletes no [PROSE-LEDGER](PROSE-LEDGER.md) row. Domain memory may later make some navigation/perception steers redundant on repeat visits; any such deletion is owned and proved by S2/S3 with their paired sweeps, or recorded here only once measured — **enabled is not claimed**.

## ADR

**Adds [ADR-0027](../../docs/adr/0027-agent-memory.md) — Agent memory: advisory-only, tainted, re-validated, sync-ready** (continues from 0025). Records: (1) cross-run memory is advisory context injected through the perception trust boundary, never an instruction and never auto-executed; (2) selector hints are durable descriptors re-resolved against S2 identity refs at use time, discarded on non-resolution; (3) memory is sanitized on write (`detectThreats`) and on read (strict posture + quarantine), and inherits taint/egress/grant enforcement unchanged (ADR-0006 pre-model ordering, ADR-0007 single tool plane); (4) skills are model-driven templates, explicitly not Phase-6 signed recipes; (5) all stores carry sync-meta. Amends nothing in 0006/0007/0008/0013 — it composes with them.

## Risks

- **Memory as an injection persistence vector (primary).** Mitigation is structural, not prose: write-side `detectThreats` filter, read-side strict-mode sanitize + forged-tag strip + quarantine, advisory-only injection through the taint boundary, and re-validation against the live DOM. The **poisoned-hint fixture is the ship gate** — S9 does not close if it shows any violation. Spike-first: PR3 lands the deterministic 0-violation arm before the funded sweep is scheduled.
- **Stale hints.** A remembered selector that has since changed must never be actioned; the live-DOM re-validation gate (PR2) is mandatory by construction and covered by a scripted regression, so staleness degrades to "no hint", never "wrong action".
- **Silent grant creep.** A remembered grant could quietly widen autonomy; mitigated by hard expiry, the `follow_a_plan` ceiling, no silent taint-crossing, and human-visible provenance/revocation (PR5/S8).
- **Cost measurement confound.** The ≥25% drop must be attributable to memory, not scenario variance; mitigated by the **paired** first-vs-second design at pooled N≥10 with a memory-on/off arm and a pre-stated equivalence margin on the first-visit guard.
