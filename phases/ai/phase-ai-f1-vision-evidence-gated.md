# Phase F1 — Vision, Evidence-Gated (Frontier)

**Status:** ⬜ Not started (gate threshold pre-registered in [M1](phase-ai-m1-measurement-baseline.md))
·  **Depends on:** the M1 gate artifact + [C3](phase-ai-c3-perception-economy.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** Give the model **eyes — only if the data says it needs them**. Gate artifact first; if the
gate passes: `CanonMessage` gains an image content type, the Anthropic + OpenAI adapters carry real
image blocks, the screenshot becomes an **escalation-only** tool, and a **set-of-marks overlay** stamps
the *same* `*[n]` index space the DOM refs use. **0 or 2 PRs — "deferred" is a valid, documented
exit.** Absorbs v1 AI-8A (`s19`).

## Why

Vision+DOM hybrid perception is the mainstream winner among top agents (CUA is vision-first), and
tepegoz is structurally blind: `CanonMessage.content` is **string-only**
([`types.ts`](../../packages/model-gateway/src/types.ts)) — the single structural blocker — and no
provider adapter carries an image block, so `browser_get_screenshot` captures a PNG the model never
sees (the v1 honesty fix made the tool say so). **But** the measured bottleneck today is escape, not
blindness — so the gate converts fashion into proven need: M1 pre-registers the threshold *before
anyone wants vision*, and the failure taxonomy from the M1..C5 sweeps is scored against it.
DOM-primary with vision-**escalation** preserves the token economy instead of copying CUA's
screenshot-every-step cost.

## Exit criteria (DoD)

- [ ] **The gate artifact is committed** — a failure-taxonomy table (canvas, image-only buttons,
      visual-layout failures) scored against the M1-pre-registered threshold, concluding **build** or
      **defer**. Both are valid exits; a defer is dated and re-evaluated at the next sweep.
- [ ] If built: **vision-required fixtures** (frozen first: canvas control, image-only button,
      visual-layout task) flip to majority-pass at pooled N; the text-only path is unaffected.
- [ ] **Escalation frequency ≤20% of steps** across the registry; **$/task on non-vision scenarios
      unchanged** (vision must not leak into the default path).
- [ ] Egress inspection + token budgeting demonstrably apply to image payloads.
- [ ] Held-out pooled aggregate: no regression beyond the flaky band; delta recorded in the
      eval-results ledger. **i18n:** internal (adapter/model-facing).

## Tasks

### PR1 — the pipe
- [ ] `CanonMessage.content` becomes a typed union (text | image) with zod at the adapter boundary
      ([`types.ts`](../../packages/model-gateway/src/types.ts)); Anthropic + OpenAI adapters
      ([`providers/`](../../packages/model-gateway/src/providers)) forward vendor image blocks;
      non-vision models degrade to the existing text note.
- [ ] `browser_get_screenshot` becomes escalation-only
      ([`screenshot-tools.ts`](../../packages/screenshots/src/screenshot-tools.ts)); the v1 honesty
      test is **inverted, not deleted** — it now asserts pixels ARE delivered on vision-capable
      routes (and still forbids recommending the tool where they are not).
- [ ] Strategy prose may recommend the screenshot again **only** on routes where the model can see it.

### PR2 — DOM↔pixel fusion (in-phase go/no-go)
- [ ] Set-of-marks overlay: draw the element indices onto the capture using the existing `centerOf`
      box→coordinate mapping — mark indices **byte-identical** to the DOM refs, so *this ref = that
      on-screen box* costs the model nothing to align.
- [ ] Vision stays a **fallback for non-DOM regions** (canvas/map/chart), never a replacement for the
      render-DOM index.
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- Gemini/Kimi adapters follow only after the Anthropic/OpenAI pair proves the delta (data change,
  per the provider-registry pattern).
- The v1 2026-07-23 vanity-flag clearance (seven blind-tool steers removed, honesty test) stays as
  prehistory in [`archive/phase-ai-8-beyond-the-port.md`](archive/phase-ai-8-beyond-the-port.md).
