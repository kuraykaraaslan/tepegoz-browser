# Phase F2 — Structured Data: Tables & Lists (Frontier)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md) (can start any
time after; cheaper after [C3](phase-ai-c3-perception-economy.md) — read-side extraction does **not**
require identity refs)  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** Tables and lists become **typed data with clickable cells** instead of flattened prose.
PR1: a typed table/list/grid extraction capability with **cell-level refs** that click through the
existing action path. PR2: a read-task scenario pack scored against **ground-truth values**, not
summary strings. 2 PRs. Absorbs v1 AI-8C (`s17`).

## Why

Today tables are invisible **as structure**: the in-page script emits only interactive nodes
([`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts));
`INTERACTABLE_ROLES` has no grid/row/cell/columnheader
([`interactable.ts`](../../packages/tool-executor/src/interactable.ts)); `browser_get_page` flattens
everything to capped `innerText` — *"open the detail of the cheapest row"* is guesswork on flat text.
The existing `data_table` scenario exercises flat-text luck, not a structural layer. Read tasks are
half of Skyvern Web Bench's read/write split and Comet's home turf — this is a whole task family the
bridge and H2H suites will contain.

## Exit criteria (DoD)

- [ ] The `s17` fixtures (**frozen first**: sortable price table, multi-page/paginated table,
      virtualized list) **majority-pass at pooled N with ground-truth VALUE scoring** — the scorer
      asserts the extracted cell value / the correct row's detail page, never a plausible summary.
- [ ] The **click-in-cell fixture passes through the existing action path** (a cell ref resolves and
      clicks like any other ref — no new click machinery).
- [ ] **Token cost of reading a 100-row table ≤ the flattened-`innerText` baseline** at
      equal-or-better accuracy (capped, honest-truncation serialization).
- [ ] Extraction output enters the model context **wrapped as untrusted** (the AI-5 boundary —
      findings are data, not instructions).
- [ ] Held-out pooled aggregate: no regression beyond the flaky band; delta recorded in the
      eval-results ledger. **i18n:** internal (model-facing serialization).

## Tasks

### PR1 — the extraction layer
- [ ] A read capability (pure composition over the render-DOM snapshot + page text where possible — a
      host primitive only if needed, per the repo's package-first rule): headers, rows, cells,
      row/column association, pagination awareness, honest `truncated` reporting, capped
      serialization; registered behind the ToolGateway PEP with a zod schema.
- [ ] Cell-level refs join the existing ref space (resolved via the same path machinery in
      [`dom-path.ts`](../../packages/tool-executor/src/dom-path.ts)).

### PR2 — the exam
- [ ] Scenario pack: pick-row-by-condition, extract-N-fields, compare-across-rows, click-in-cell;
      ground-truth values in the fixture (revealed only by the correct read, per the runbook's
      authoring rule).
- [ ] Virtualized/paginated policy composes with [C5](phase-ai-c5-tabs-popups-widgets.md)'s quantized
      scroll (cross-reference, don't duplicate).
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- Read-side only; bulk `extract_content`-style large payloads stay deferred (input-size concerns,
  v1 decision kept).
- Personal-knowledge-graph / semantic-history storage of extracted data is
  [Phase 8](../phase-8-local-intelligence-sovereignty.md); this phase returns data to the *run*, it
  does not persist it ([F3](phase-ai-f3-domain-memory.md) persists only page-shape observations).
