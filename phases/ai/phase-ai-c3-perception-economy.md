# Phase C3 — Perception Economy (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** Make perception **cheap by construction**. PR1: host-side **read-dedupe** — an unchanged page
returns *"unchanged since sig X"* instead of the full 200-element list. PR2: **identity-stable refs**
across snapshots + **diff-based updates** + full accessible-name resolution. Cheaper runs compound the
entire measurement program: every later N≥10 sweep, bridge run, and vision experiment gets cheaper.

## Why

Measured waste: one valid live trial burned **22 consecutive full `browser_get_elements` reads**
(M1's cap stops the bleed; this fixes it structurally). Today refs are **positional per snapshot** and
the full list is resent on every read ([`interactable.ts`](../../packages/tool-executor/src/interactable.ts));
the only cross-snapshot signal is the `*[n]` marker
([`dom-tree.ts`](../../packages/tool-executor/src/dom-tree.ts) `markNewElements`) — v1 `s09`/`s23`.
The default path also derives a **weaker accessible name** than the a11y fallback computes —
`aria-labelledby`/`label-for` are unresolved in
[`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) (v1 `s04`).
Comet's simplified-DOM token economy is a proven competitive edge; identity-stable refs are also the
substrate [F2](phase-ai-f2-structured-data.md)/[F3](phase-ai-f3-domain-memory.md) build on.

## Exit criteria (DoD)

- [ ] **≥3 identical consecutive full reads are impossible by construction** (harness-asserted
      fixture): the second identical read returns the compact "unchanged" form.
- [ ] **Median tokens/task and $/task down ≥30%** on the registry at equal-or-better pooled pass-rate
      (Wilson CIs) — reported **both** against the raw M1 baseline **and** excluding the pathological
      22-read scenario (the honest number; the pathology flatters the headline).
- [ ] **Identity fixture:** an element moved by a re-render keeps its ref **or reports staleness
      honestly**; the adversarial re-render fixture (frozen before PR2 lands) passes. The v1 AI-3
      structural page-signature stale-ref guard is **explicitly retained** as the safety net — a
      mis-mapped identity ref is a silent mis-click, worse than a stale-ref error.
- [ ] `aria-labelledby`/`label-for` resolved in the default path (a `labelledby`-only control carries
      its real name); a11y-fallback parity asserted on the fixture.
- [ ] Held-out pooled aggregate: no regression beyond the flaky band.
- [ ] The `browser_get_elements` description prose retired per the DoD rule (paired with/without sweep;
      [`PROSE-LEDGER.md`](PROSE-LEDGER.md) updated in the proving PR).
- [ ] Delta recorded in the eval-results ledger. **i18n:** internal (serialization is model-facing
      English).

## Tasks

### PR1 — read-dedupe + metrics
- [ ] Reuse the structural page-signature already computed by
      [`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts)
      `readPage` (v1 AI-3 PR3): `snapshotElements`/`browser_get_elements` compare against the per-tab
      previous sig and return the compact unchanged-form instead of re-serializing 200 elements.
- [ ] Harness metrics: tokens/task and `get_elements`-calls/task columns
      ([`report.ts`](../../packages/agent-eval/src/report.ts)).

### PR2 — identity refs + diffs + names
- [ ] Freeze the adversarial re-render fixture **first**.
- [ ] Identity-stable refs: persist per-element identity (fingerprint lineage from `markNewElements`)
      across snapshots within a run; unchanged elements keep their ref, the serialization sends
      **diffs** (new/changed/gone) instead of the full list; a full re-list remains available on
      demand and after navigation.
- [ ] `aria-labelledby`/`label-for` resolution in `textOf()`
      ([`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts)), with
      the pure mirror in [`interactable.ts`](../../packages/tool-executor/src/interactable.ts) and the
      injected-`.toString()` test pattern kept (what's tested is what runs).
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- **Identity-stable refs are per-run perception identity, NOT persisted selectors** — persisted
  self-healing selectors are [Phase 6](../phase-6-deterministic-automation.md) territory (routing
  boundary stated here on purpose).
- Lane A (perception/loop-adjacent); runs after [C1](phase-ai-c1-structured-state-replan.md)→
  [C2](phase-ai-c2-replanner.md) unless the M1 checkpoint re-cuts the order.
- Closed-shadow/cross-origin frames are **not** this phase —
  [C4](phase-ai-c4-obstructed-pages.md) owns that go/no-go.
