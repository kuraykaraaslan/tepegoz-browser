# Phase C4 — Obstructed-Page Reliability (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md) (its
`cookie_consent` diagnosis)  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** Make the agent reliable on **obstructed pages** — the consent banners, overlays, and modals
that dominate the commercial (and Turkish) web. PR1: action-time **occlusion re-check** + a **locator
cascade**. PR2: the `cookie_consent` fix per M1's transcript diagnosis + **modal-close smart recovery**,
plus a documented **go/no-go on closed-shadow/cross-origin frames**. May jump **ahead of
[C3](phase-ai-c3-perception-economy.md)** in Lane A if M1's diagnosis shows a small click-path/occlusion
bug (the recorded exception in the [README sequencing](README.md#sequencing)).

## Why

`cookie_consent` is **0/3 with ZERO escapes** — a distinct, measured interaction gap, proof that escape
is *not* the single ceiling. And v1 `s05` documented the structural hole: occlusion is checked only at
**snapshot** time (`isTopElement`); at click time
[`cdp-driver.electron.ts`](../../apps/desktop/src/main/agent/cdp-driver.electron.ts) `clickElement`
does **no** occlusion re-verification (`getBoxModel` is not occlusion-aware), so an overlay appearing
between read and click is silently clicked. Each ref resolves to exactly **one** address — a failed
locate forces a full re-snapshot instead of trying an alternative locator for the *same* node.

## Exit criteria (DoD)

- [ ] **`cookie_consent` root cause documented and flipped to ≥7/10 at N≥10** (claim-bearing target
      scenario, Wilson CI recorded).
- [ ] The `s05` occlusion fixture flips: an overlay appearing between read and click produces
      *"occluded — re-read"* + reveal-then-retry (observed in a harness transcript), never a blind
      click on the overlay; a blocking-modal fixture majority-passes at pooled N.
- [ ] **Locator cascade:** on a failed primary locate, an alternative locator for the same node is
      attempted before conceding `selector_stale` (fixture-proven).
- [ ] M1-stratum realUrl consent-banner scenarios pass **without per-site prose** (CODE > PROSE check
      recorded).
- [ ] **Escape-rate does not increase** — overlay frustration must not become wandering (family
      escape-rate column compared against the C1/C2 level).
- [ ] **Closed-shadow / cross-origin frames go/no-go recorded:** built only if the M1/C1 failure
      taxonomy demands per-frame CDP injection; a deferral is a dated note, never a silent gap.
- [ ] Fixtures frozen before capability code; held-out pooled no-regress; the reveal-hidden-navigation
      prose line reviewed in [`PROSE-LEDGER.md`](PROSE-LEDGER.md) (deleted only if the paired sweep
      proves subsumption); delta recorded in the eval-results ledger.
      **i18n:** internal; any handoff/console string EN+TR in the owning dict.

## Tasks

### PR1 — occlusion re-check + locator cascade (`s05`)
- [ ] Centre/corner `elementFromPoint` re-check inside the click path before dispatch (throw
      *occluded* instead of clicking the overlay); `fillElement`'s focus-retry pattern is the
      precedent.
- [ ] Alternative-locator attempt (e.g. re-resolve by the element's identity fingerprint / a11y
      `backendNodeId` counterpart) before `selector_stale`; keep one honest error taxonomy
      ([`recovery.ts`](../../packages/orchestrator/src/recovery.ts) kinds unchanged).

### PR2 — consent/modal competence + frames decision
- [ ] Fix `cookie_consent` per the M1 transcript diagnosis (whatever the data says — click-path bug,
      perception gap, or decision gap; the diagnosis, not this doc, decides the mechanism).
- [ ] Modal-close smart recovery (v1 `s13` slice): a detected blocking overlay/modal produces a
      deterministic dismiss-or-reveal attempt before generic recovery.
- [ ] The closed-shadow/cross-origin go/no-go note
      ([`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) reads
      them as null today).
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- Lane A. Re-login walls and OAuth popups are [C5](phase-ai-c5-tabs-popups-widgets.md); this phase is
  same-page obstruction.
- Site-specific DOM adapters stay in [Phase 2](../phase-2-adapters-safe-browsing.md) — the fix here
  must be general (that is what the no-per-site-prose exit line asserts).
