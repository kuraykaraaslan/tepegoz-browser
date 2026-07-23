# Phase C5 — Tabs, Popups & Typed Widgets (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** Close the v1 [AI-4](archive/phase-ai-4-action-vocabulary.md) remainder as one coherent axis:
PR1 — a **tab-spawn world model** (detect a click that opened a new tab, follow it, return after a
popup closes) and re-login walls routed to the **Human-Handoff**. PR2 — **send-keys chords**,
**page-quantized scroll with boundary detection**, and **typed-widget fill helpers**. All registered
behind the same CapabilityRegistry/ToolGateway PEP with zod-`safeParse`d schemas, reusing the
real-gesture human-input path.

## Why

OAuth popups and `target=_blank` flows are ubiquitous commerce paths every rival handles; a click that
silently spawns a tab strands today's agent on the wrong page (v1 `s18` — same-origin iframe auto-entry
works, tab-spawn detect/auto-switch and popup-return are unbuilt). Typed widgets (datepicker, combobox,
masked input) sink whole task families — the v1 `s16` remainder after `browser_validate_form` landed.
These will dominate the realUrl and bridge suites the moment the escape ceiling lifts.

## Exit criteria (DoD)

- [ ] **Tab-spawn/auto-switch/return** fixture and an **OAuth-style popup-return** fixture each
      majority-pass at pooled N (fixtures frozen before capability code).
- [ ] **Datepicker, combobox, masked-input** fixtures each majority-pass at pooled N;
      required-checkbox/radio state becomes honestly reportable to
      `browser_validate_form` (today a required toggle is deliberately not reported).
- [ ] **send_keys** and **quantized-scroll boundary** fixtures pass without degenerate loops
      ("already at bottom" is reported, never re-scrolled blindly).
- [ ] The **re-login-wall fixture asserts the handoff fires** (mirroring `login_form`'s M1 re-scoped
      contract — the agent NEVER auto-submits credentials).
- [ ] Held-out pooled aggregate: no regression beyond the flaky band.
- [ ] The **tab-discipline prose retired** per the DoD rule (paired with/without sweep;
      [`PROSE-LEDGER.md`](PROSE-LEDGER.md) updated in the proving PR).
- [ ] Delta recorded in the eval-results ledger.
- [ ] **i18n:** tool descriptions are model-facing English; any Agent Console label EN+TR in the
      owning package dict.

## Tasks

### PR1 — tab world model + handoff routing (`s18`)
- [ ] Host primitives in [`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts)
      + the tab engine ([`tab-tools.ts`](../../packages/tab-engine/src/tab-tools.ts)): new-tab
      detection on click (tab-id diff), auto-switch of the acting tab, popup-closed → return-to-main.
- [ ] Surface the transition in the `browser_update_page` result (the model is told *"your click
      opened tab N; you are now acting on it"*), wrapped/sanitized like every observation.
- [ ] Re-login-wall detection routes to the existing handoff/hold plane
      ([`run-control.ts`](../../packages/orchestrator/src/run-control.ts)) — no credential competence
      is built, by design.

### PR2 — input vocabulary
- [ ] `send_keys` chords as a `browser_update_page` variant
      ([`browser-tools.ts`](../../packages/browser-tools/src/browser-tools.ts)) over the real-gesture
      input path.
- [ ] Page-quantized scroll (`next_page`/`previous_page`/`to_top`/`to_bottom`, optional inner
      scroll-container by ref) with boundary detection.
- [ ] Typed-widget fill helpers (datepicker/combobox/masked/ARIA autocomplete) — deterministic,
      rule-based, no model call inside an action; errors honestly on unrecognized widgets.
- [ ] Fixtures + exit sweep (single-change branch, serialized).

## Scope notes
- **Strictly single-task tab-FOLLOWING** — parallel multi-tab DAG / Shadow Workspace is
  [Phase 1b](../phase-1b-agentic-deepening.md), referenced not built; tab CRUD tools already exist and
  are not re-owned.
- Lane A for PR1 (touches the acting-tab model); PR2 is tool-surface work and may interleave with
  Lane B if the constitution's attribution rule is preserved.
