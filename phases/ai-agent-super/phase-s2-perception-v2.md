# Phase S2 — Perception v2 (W2 Perception / token-economy engine for W3 Speed)

**Status:** 🟡 In progress (PR0–PR1 landed 2026-08-18) · **Depends on:** [S0 Truth & Repair](phase-s0-truth-and-repair.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Give the model a stable, deduplicated, diff-based view of the page so it stops re-reading the whole world every step. Element references become identity-stable content hashes that survive snapshots within a run, unchanged regions are elided, and form-field labels are resolved during the scan so fields are named correctly. This is the clearest single perception delta against Claude for Chrome (its persistent cross-turn ref IDs) and it is simultaneously the token-economy engine that W3 Speed draws on.

## Why

Element references are **positional and invalidated every snapshot**. [interactable.ts `finalizeElements`](../../packages/tool-executor/src/interactable.ts) assigns 1-based positional refs, and only `*` marks new elements via [dom-tree.ts `markNewElements`](../../packages/tool-executor/src/dom-tree.ts). So an unchanged page hands the model the full ≤200-element list again on the next step — burning tokens (pain 3) and disorienting the model, because the same button is `*[7]` this step and `*[4]` next step (pain 2). The reactor only *bounds* this with the ×5 [`readLoopThreshold`](../../packages/orchestrator/src/reactor.ts) streak guard; it never dedupes or diffs the view.

There is **no read-dedupe and no diffing**. The perception cost is paid in full every read even when nothing moved. A structural **djb2 page signature already exists** in [browser-host.electron.ts `readPage`](../../apps/desktop/src/main/agent/browser-host.electron.ts) for change detection — the diff engine can reuse it rather than inventing a second change oracle.

Labels are wrong on forms. In the render-DOM default path, [build-dom-tree-script.ts `textOf`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) does not resolve `aria-labelledby` or `label[for=…]`, so a field whose visible name lives in a sibling `<label>` or a referenced node comes through unnamed or mislabelled (pain 1 on forms). The [a11y fallback](../../apps/desktop/src/main/agent/cdp-driver-snapshot.electron.ts) (`TEPEGOZ_PERCEPTION=a11y`) actually computes a *better* accessible name — the default path is the regression, not the fallback.

Prior art gives us the shape of the win without the claim: browser-use's TSV serialisation cut its own token count ~40%. We do not inherit that number — we measure **our own** token delta through the existing cost plumbing.

## Exit criteria (DoD)

- [ ] Tokens/step on the **perception + web-patterns** families down **≥30%** vs the S0 baseline (⏸ funded sweep · paired, pooled **N≥10**, via existing `TEPEGOZ_EVAL_RATES` cost plumbing in [statistics.ts](../../packages/agent-eval/src/statistics.ts)).
- [ ] **Perception family** pooled pass **≥80%** with **Wilson lower bound ≥60%** at **N≥10** (⏸ funded sweep).
- [ ] **No regression >5pp** pooled on the **web-patterns** family (⏸ funded sweep).
- [x] Identity-stable refs survive ≥N snapshots within a run for unchanged elements (deterministic assertion in the scripted tier — not funding-blocked).
- [ ] `aria-labelledby` / `label[for]` resolved in the **default** render-DOM path; `label-for-form` fixture names every field correctly under scripted assertion.
- [ ] New `browser_get_page_text` tool returns article-priority clean text + title + url (scripted assertion; parity with Claude for Chrome).
- [x] Fixtures `ref-stability-across-rerender`, `label-for-form`, `dynamic-list-update` **frozen in PR0 before any capability code** (constitution: fixtures-first).
- [ ] Paired with/without-flag sweep recorded as a **delta row in [eval-results.md](eval-results.md)** and the [PROSE-LEDGER](PROSE-LEDGER.md) (constitution: delta recorded; paired for any prose deletion).
- [ ] [PROSE-LEDGER](PROSE-LEDGER.md) **row 7** (browser_get_elements collapsed-menu note) moved to DELETED-or-RETAINED by the paired sweep.
- [ ] i18n EN + full-TR parity for any user-facing surface (the new tool's approval/label strings) in the **same PR** (ADR-0016/0017).

## Tasks

### PR0 — fixture freeze

- [x] Add `ref-stability-across-rerender`, `label-for-form`, `dynamic-list-update` scenarios + frozen HTML fixtures under [packages/agent-eval](../../packages/agent-eval) registry (perception family file).
- [x] Wire the three into the perception registry index; assert they run in the scripted tier and are **inert-safe** (no capability code exists yet — they encode the *target* behaviour).
- [x] Record the freeze hash in the ledger so PR1–PR4 cannot silently move ground-truth.

### PR1 — identity-stable content-hash refs (env-flagged)

- [x] Compute `ref = hash(tag + role + accessible name + structural path)` where the path comes from [dom-path.ts `resolveNodePath`](../../packages/tool-executor/src/dom-path.ts); assign in [build-dom-tree-script.ts](../../apps/desktop/src/main/agent/build-dom-tree-script.ts), finalise in [interactable.ts `finalizeElements`](../../packages/tool-executor/src/interactable.ts).
- [x] Hold a **per-tab ref map** in [browser-host.electron.ts](../../apps/desktop/src/main/agent/browser-host.electron.ts) alongside the existing djb2 sig; refs survive snapshots within a run.
- [x] Gate the whole path behind an env flag (e.g. `TEPEGOZ_PERCEPTION_V2`) so the positional path stays the default and the degraded fallback.
- [x] zod safeParse the ref-map entries at the IPC boundary; `@tepegoz/shared-types` owns the `StableRef` schema.

> **Mechanism deviation (recorded, PR1 — this IS the spike the Risks section asked for).** The identity
> key **excludes the structural path**: it is `tag | role | accessible name | href`, with an occurrence
> suffix (`#0`, `#1`, …) separating duplicate controls in document order. Including the path would have
> defeated the property being bought — `ref-stability-across-rerender` rebuilds the list at a new nesting
> depth in reverse order, so every path changes while nothing about the elements does, and a
> path-inclusive hash renumbers all of them. The cost is that two *identical* controls which swap places
> swap refs; accepted, because nothing distinguishes them to a human reader either. The degraded mode the
> Risks section requires is implemented as a **carry-over-rate floor** (30%): below it the registry resets
> and refs go positional for that snapshot, logged, because on a wholesale rewrite stability was never
> achievable. The zod boundary sits at the **CDP read site** (the driver), not inside `@tepegoz/tool-executor`
> — that package is a pure leaf with no workspace dependencies, and `@tepegoz/shared-types` still owns the
> `StableRef` schema as the single source.

### PR2 — diff serialisation + unchanged-region elision

- [ ] Generalise `*` (new-only) into **added / removed / changed** diff sections in [dom-tree.ts `markNewElements`](../../packages/tool-executor/src/dom-tree.ts), keyed off the per-tab ref map + reused djb2 sig.
- [ ] Emit unchanged-region elision markers ("§ 42 elements unchanged since step 3") instead of re-listing stable elements.
- [ ] Compact tabular (TSV-style) encoding in the serialiser; keep it behind the same flag. Measure **our own** token delta — no borrowed percentages.
- [ ] Ensure elision respects the `SCAN_EMIT_CAP 300 / 200` caps rather than fighting them.

### PR3 — label resolution in the default scan pass

- [ ] JOIN `aria-labelledby` and `label[for=…]` inside the single scan traversal in [build-dom-tree-script.ts `textOf`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) (cheap, same pass — no second walk).
- [ ] Make the resolved name feed the accessible-name component of the PR1 hash so labels are both correct **and** identity-stable.
- [ ] Bring the default path to parity with the a11y-fallback naming for the `label-for-form` fixture.

### PR4 — `browser_get_page_text`

- [ ] Add `browser_get_page_text` to [browser-tools.ts](../../packages/browser-tools/src/browser-tools.ts) returning article-priority clean text + title + url; reuse `buildPageSnapshot` in [perception.ts](../../packages/browser-tools/src/perception.ts).
- [ ] Register it in the single tool plane (ToolGateway PEP, ADR-0007); zod-validate args/results; EN+TR strings for any approval label.
- [ ] Keep the file under the 250-line cap; extract the extraction helper if needed.

### PR5 — paired sweep + steer deletion

- [ ] Run the paired with/without-`TEPEGOZ_PERCEPTION_V2` sweep on perception + web-patterns (⏸ funded key).
- [ ] Record the token and pass deltas in [eval-results.md](eval-results.md) and the ledger.
- [ ] Move [PROSE-LEDGER](PROSE-LEDGER.md) **row 7** to DELETED (if the sweep shows the collapsed-menu note no longer earns its tokens) or RETAINED, paired.
- [ ] Promote the flag to default only if all three sweep gates pass; otherwise the phase rests at 🟠 measurement-owed.

## Fixtures

Frozen in **PR0**, added to [packages/agent-eval](../../packages/agent-eval) (perception family):

- `ref-stability-across-rerender` — a page that re-renders its DOM subtree without semantic change; asserts the same element keeps its ref across snapshots.
- `label-for-form` — a form whose field names live in `aria-labelledby` / `label[for]` targets; asserts every field is named correctly in the default path.
- `dynamic-list-update` — a list that adds/removes/changes rows between steps; asserts the diff sections and elision markers are correct and that unchanged rows are elided.

## Prose steers

Owns **[PROSE-LEDGER](PROSE-LEDGER.md) row 7** — the `browser_get_elements` collapsed-menu note. The PR5 paired sweep decides DELETED-or-RETAINED. No other rows.

## ADR

**Amends [ADR-0008](../../docs/adr/) status note** (DOM/a11y-first perception + vision as fallback): records that the render-DOM default path now resolves `aria-labelledby`/`label-for` and carries identity-stable refs + diffing. **No decision change** — DOM/a11y stays primary, vision stays the fallback. No new ADR.

## Risks

- **Hash instability on wholesale-DOM-rewrite sites** — SPAs that regenerate the whole tree defeat structural-path hashing. Mitigation: the per-snapshot positional path remains as the **degraded mode** behind the flag; the diff engine falls back to full-list emission when the ref-map hit rate drops below a threshold. Spike this in PR1 against a known rewrite-heavy fixture before committing the hash formula.
- **250-line cap on the ported [build-dom-tree-script.ts](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) monolith** — label resolution + hashing grows it. Mitigation: split the scan into modules (traversal / naming / hashing / serialisation) targeting a `@tepegoz/*` package rather than growing `apps/desktop`; document a cap exemption only if the isolated-world script genuinely cannot be split.
- **Elision hiding a real change** — an unchanged-region marker that swallows a mutation the djb2 sig missed. Mitigation: reuse the existing sig as the authority and assert `dynamic-list-update` catches every mutation; never elide a region whose sig changed.
- **Token-delta measurement is funding-blocked** — the ≥30% gate needs the funded sweep. Mitigation: all deterministic behaviour (ref stability, label correctness, get_page_text) is asserted in the scripted tier and lands green; the phase rests at 🟠 until the sweep runs.
