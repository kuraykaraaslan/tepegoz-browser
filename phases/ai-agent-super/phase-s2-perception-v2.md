# Phase S2 — Perception v2 (W2 Perception / token-economy engine for W3 Speed)

**Status:** 🟠 Measurement-owed (PR0–PR4 landed 2026-08-18; PR5 ⏸ funded) · **Depends on:** [S0 Truth & Repair](phase-s0-truth-and-repair.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Give the model a stable, deduplicated, diff-based view of the page so it stops re-reading the whole world every step. Element references become identity-stable content hashes that survive snapshots within a run, unchanged regions are elided, and form-field labels are resolved during the scan so fields are named correctly. This is the clearest single perception delta against Claude for Chrome (its persistent cross-turn ref IDs) and it is simultaneously the token-economy engine that W3 Speed draws on.

## Why

Element references are **positional and invalidated every snapshot**. [interactable.ts `finalizeElements`](../../packages/tool-executor/src/interactable.ts) assigns 1-based positional refs, and only `*` marks new elements via [dom-tree.ts `markNewElements`](../../packages/tool-executor/src/dom-tree.ts). So an unchanged page hands the model the full ≤200-element list again on the next step — burning tokens (pain 3) and disorienting the model, because the same button is `*[7]` this step and `*[4]` next step (pain 2). The reactor only _bounds_ this with the ×5 [`readLoopThreshold`](../../packages/orchestrator/src/reactor.ts) streak guard; it never dedupes or diffs the view.

There is **no read-dedupe and no diffing**. The perception cost is paid in full every read even when nothing moved. A structural **djb2 page signature already exists** in [browser-host.electron.ts `readPage`](../../apps/desktop/src/main/agent/browser-host.electron.ts) for change detection — the diff engine can reuse it rather than inventing a second change oracle.

Labels are wrong on forms. In the render-DOM default path, [build-dom-tree-script.ts `textOf`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) does not resolve `aria-labelledby` or `label[for=…]`, so a field whose visible name lives in a sibling `<label>` or a referenced node comes through unnamed or mislabelled (pain 1 on forms). The [a11y fallback](../../apps/desktop/src/main/agent/cdp-driver-snapshot.electron.ts) (`TEPEGOZ_PERCEPTION=a11y`) actually computes a _better_ accessible name — the default path is the regression, not the fallback.

Prior art gives us the shape of the win without the claim: browser-use's TSV serialisation cut its own token count ~40%. We do not inherit that number — we measure **our own** token delta through the existing cost plumbing.

## Exit criteria (DoD)

- [ ] Tokens/step on the **perception + web-patterns** families down **≥30%** vs the S0 baseline (⏸ funded sweep · paired, pooled **N≥10**, via existing `TEPEGOZ_EVAL_RATES` cost plumbing in [statistics.ts](../../packages/agent-eval/src/statistics.ts)).
- [ ] **Perception family** pooled pass **≥80%** with **Wilson lower bound ≥60%** at **N≥10** (⏸ funded sweep).
- [ ] **No regression >5pp** pooled on the **web-patterns** family (⏸ funded sweep).
- [x] Identity-stable refs survive ≥N snapshots within a run for unchanged elements (deterministic assertion in the scripted tier — not funding-blocked).
- [x] `aria-labelledby` / `label[for]` resolved in the **default** render-DOM path; `label-for-form` fixture names every field correctly under scripted assertion.
- [x] New `browser_get_page_text` tool returns article-priority clean text + title + url (scripted assertion; parity with Claude for Chrome).
- [x] Fixtures `ref-stability-across-rerender`, `label-for-form`, `dynamic-list-update` **frozen in PR0 before any capability code** (constitution: fixtures-first).
- [ ] Paired with/without-flag sweep recorded as a **delta row in [eval-results.md](eval-results.md)** and the [PROSE-LEDGER](PROSE-LEDGER.md) (constitution: delta recorded; paired for any prose deletion).
- [ ] [PROSE-LEDGER](PROSE-LEDGER.md) **row 7** (browser_get_elements collapsed-menu note) moved to DELETED-or-RETAINED by the paired sweep.
- [ ] i18n EN + full-TR parity for any user-facing surface (the new tool's approval/label strings) in the **same PR** (ADR-0016/0017).

## Tasks

### PR0 — fixture freeze

- [x] Add `ref-stability-across-rerender`, `label-for-form`, `dynamic-list-update` scenarios + frozen HTML fixtures under [packages/agent-eval](../../packages/agent-eval) registry (perception family file).
- [x] Wire the three into the perception registry index; assert they run in the scripted tier and are **inert-safe** (no capability code exists yet — they encode the _target_ behaviour).
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
> path-inclusive hash renumbers all of them. The cost is that two _identical_ controls which swap places
> swap refs; accepted, because nothing distinguishes them to a human reader either. The degraded mode the
> Risks section requires is implemented as a **carry-over-rate floor** (30%): below it the registry resets
> and refs go positional for that snapshot, logged, because on a wholesale rewrite stability was never
> achievable. The zod boundary sits at the **CDP read site** (the driver), not inside `@tepegoz/tool-executor`
> — that package is a pure leaf with no workspace dependencies, and `@tepegoz/shared-types` still owns the
> `StableRef` schema as the single source.

### PR2 — diff serialisation + unchanged-region elision

- [x] Generalise `*` (new-only) into **added / removed / changed** diff sections in [dom-tree.ts `markNewElements`](../../packages/tool-executor/src/dom-tree.ts), keyed off the per-tab ref map + reused djb2 sig.
- [x] Emit unchanged-region elision markers ("§ 42 elements unchanged since step 3") instead of re-listing stable elements.
- [x] Compact tabular (TSV-style) encoding in the serialiser; keep it behind the same flag. Measure **our own** token delta — no borrowed percentages.
- [x] Ensure elision respects the `SCAN_EMIT_CAP 300 / 200` caps rather than fighting them.

> **Note (PR2).** A **relabelled** element reads as one removal plus one addition, not as `changed` —
> the name is part of the PR1 identity, so a new label is a new identity. `changed` is reserved for a
> genuine state change at the same identity (a value typed, a control disabled, `aria-expanded` flipped).
> That is more useful to the model than a "changed" row would be, because it names the ref to use next.
> Elision leaves runs shorter than four elements listed (local context around a change is worth more than
> the tokens) and is gated by the same flag as stable refs: eliding under positional refs would hide
> elements whose numbers had silently moved.

### PR3 — label resolution in the default scan pass

- [x] JOIN `aria-labelledby` and `label[for=…]` inside the single scan traversal in [build-dom-tree-script.ts `textOf`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) (cheap, same pass — no second walk).
- [x] Make the resolved name feed the accessible-name component of the PR1 hash so labels are both correct **and** identity-stable.
- [x] Bring the default path to parity with the a11y-fallback naming for the `label-for-form` fixture.

### PR4 — `browser_get_page_text`

- [x] Add `browser_get_page_text` to [browser-tools.ts](../../packages/browser-tools/src/browser-tools.ts) returning article-priority clean text + title + url; reuse `buildPageSnapshot` in [perception.ts](../../packages/browser-tools/src/perception.ts).
- [x] Register it in the single tool plane (ToolGateway PEP, ADR-0007); zod-validate args/results; EN+TR strings for any approval label.
- [x] Keep the file under the 250-line cap; extract the extraction helper if needed.

> **Naming + scope deviations (recorded, PR4).**
>
> 1. The tool ships as **`browser_get_article`**, not `browser_get_page_text`. `ToolNameSchema`
>    (`@tepegoz/shared-types`) enforces `{domain}_{verb}_{noun}` with an approved verb and a single noun
>    segment, and the registry `parse`s it — `browser_get_page_text` is rejected at registration. Same
>    capability, a name the plane accepts.
> 2. It does **not** reuse `buildPageSnapshot`'s _input_ the way the task line suggested: article text
>    needs its own in-page extraction (the content root the page declares, minus chrome), so the
>    extraction is a new injected script and `buildPageSnapshot` is reused for the sanitize/wrap step,
>    which is the part that matters for the trust boundary. The tool reports `source` — the root it
>    actually used, or `'body'` — so "I got an article" is never assumed.
> 3. `browser-tools.ts` was **already 537 lines**, over the ADR-0010 cap, before this PR; the tool adds
>    ~25 more. Splitting the registry file is a real cleanup but an unrelated one, and doing it inside a
>    capability PR would bury the change. Recorded rather than silently absorbed.
>
> **i18n:** no new user-facing strings. Tool descriptions are model-facing English by the track's own
> convention, the tool is `read`-class so it raises no approval prompt, and no UI surface names it.

### PR5 — paired sweep + steer deletion

- [ ] Run the paired with/without-`TEPEGOZ_PERCEPTION_V2` sweep on perception + web-patterns (⏸ funded key).
- [ ] Record the token and pass deltas in [eval-results.md](eval-results.md) and the ledger.
- [ ] Move [PROSE-LEDGER](PROSE-LEDGER.md) **row 7** to DELETED (if the sweep shows the collapsed-menu note no longer earns its tokens) or RETAINED, paired.
- [ ] Promote the flag to default only if all three sweep gates pass; otherwise the phase rests at 🟠 measurement-owed.

### PR6 — Structured site-declared tools (WebMCP) — investigation, then a decision

> **Where this came from.** [`research/competitors/claude-extension-gemini.md`](../../research/competitors/claude-extension-gemini.md),
> which argues that screenshot-driven visual scraping is a dead end on both cost and speed, and points at
> **WebMCP (`navigator.modelContext`)** — a site declaring its own operations (`searchProducts`, `addToCart`,
> `checkout`) as structured tools an agent calls directly — as the way out. Same report: build-time stable
> element ids (Domscribe-style `data-ds`) as the intermediate step for sites that will never adopt a standard.
>
> **Why it lands in S2 and not in a feature phase.** This is a perception question — how the agent learns what
> a page can do. Today that answer is one thing (`buildDomTree` over the rendered DOM). A site-declared tool
> surface would be a **second, higher-trust channel**, and adding a channel changes the trust model: a page
> declaring its own tools is still **untrusted input**, so its declarations must pass the same zod boundary and
> the same policy classification as any other tool call, and must never be able to name a capability the agent
> does not already hold.

- [ ] **Spike, do not adopt.** Establish whether `navigator.modelContext` has real adoption or is still a
      proposal with no sites behind it. A perception channel with no pages to perceive is cost, not capability.
      Record the finding either way — a refutation is a result, as [S5](phase-s5-code-execution.md) already
      demonstrated for its own sandbox.
- [ ] **If it is real:** an ADR covering the trust boundary (site-declared tools are untrusted, validated,
      policy-classified, and cannot widen a grant), the fallback path when a site declares tools that lie or
      break, and how a declared tool's result is verified against observed page state rather than believed.
- [ ] **Measure the claim, not the idea.** Paired sweep on the perception family: tokens and wall-clock for a
      DOM-driven run versus a declared-tool run on the same task. The report's promise is "milliseconds instead
      of seconds and a large token saving" — that is a hypothesis with a number attached, so measure it.
- [ ] **Stable-id ingestion** as the cheaper half: when a page already exposes stable test/build ids, prefer
      them over positional refs in the content-hash scheme from PR1. No standard needed, works today.

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
